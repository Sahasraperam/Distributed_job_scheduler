import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateJobDto, CreateScheduledJobDto } from '@codity/shared';
import { JobStatus, Job } from '@codity/database';
import { MetricsGateway } from '../metrics/metrics.gateway';
import * as cronParser from 'cron-parser';

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private metricsGateway: MetricsGateway
  ) {}

  async create(dto: CreateJobDto): Promise<Job> {
    // Determine initial status and execution target time
    let status: JobStatus = JobStatus.QUEUED;
    let nextRunAt = new Date();

    if (dto.nextRunAt) {
      status = JobStatus.SCHEDULED;
      nextRunAt = new Date(dto.nextRunAt);
      if (isNaN(nextRunAt.getTime())) {
        throw new BadRequestException('Invalid nextRunAt date format');
      }
    }

    if (dto.parentJobId) {
      // If parentJob is not completed, child job starts as SCHEDULED (blocked)
      const parent = await this.prisma.job.findUnique({ where: { id: dto.parentJobId } });
      if (!parent) {
        throw new NotFoundException('Parent job not found');
      }
      if (parent.status !== JobStatus.COMPLETED) {
        status = JobStatus.SCHEDULED;
        // set nextRunAt to far future or handle state promotion upon parent completion
        nextRunAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year out, promoted when parent completes
      }
    }

    const job = await this.prisma.job.create({
      data: {
        projectId: dto.projectId,
        queueId: dto.queueId,
        name: dto.name,
        payload: dto.payload,
        status,
        priority: dto.priority ?? 0,
        maxAttempts: dto.maxAttempts ?? 3,
        nextRunAt,
        retryPolicyId: dto.retryPolicyId,
        batchId: dto.batchId,
        parentJobId: dto.parentJobId,
      },
    });

    // Create initial audit and log
    await this.prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'INFO',
        message: `Job created with status: ${status}`,
      },
    });

    // Notify metrics
    this.metricsGateway.broadcastJobStateChange({
      jobId: job.id,
      queueId: job.queueId,
      projectId: job.projectId,
      oldStatus: 'NONE',
      newStatus: status,
      timestamp: new Date().toISOString(),
    });

    return job;
  }

  async createRecurring(dto: CreateScheduledJobDto) {
    let nextRunAt: Date;
    try {
      const interval = cronParser.parseExpression(dto.cronExpression, { tz: dto.timezone ?? 'UTC' });
      nextRunAt = interval.next().toDate();
    } catch (e) {
      throw new BadRequestException('Invalid cron expression or timezone');
    }

    const scheduledJob = await this.prisma.scheduledJob.create({
      data: {
        projectId: dto.projectId,
        queueId: dto.queueId,
        name: dto.name,
        cronExpression: dto.cronExpression,
        timezone: dto.timezone ?? 'UTC',
        payload: dto.payload,
        nextRunAt,
      },
    });

    return scheduledJob;
  }

  async findAll(
    projectId: string,
    filters: { queueId?: string; status?: JobStatus; search?: string },
    page = 1,
    limit = 10
  ) {
    const skip = (page - 1) * limit;
    const where: any = { projectId };

    if (filters.queueId) {
      where.queueId = filters.queueId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          queue: true,
          retryPolicy: true,
          worker: true,
        },
      }),
      this.prisma.job.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        queue: true,
        retryPolicy: true,
        worker: true,
        executions: {
          orderBy: { startedAt: 'desc' },
          include: { worker: true },
        },
        childJobs: true,
      },
    });

    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async getLogs(jobId: string) {
    return this.prisma.jobLog.findMany({
      where: { jobId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async retry(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      // If in DLQ, remove from DLQ
      await tx.deadLetterQueue.updateMany({
        where: { jobId, status: 'PENDING' },
        data: { status: 'RETRIED' },
      });

      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.QUEUED,
          attemptsMade: 0,
          nextRunAt: new Date(),
          failedAt: null,
          completedAt: null,
        },
      });

      await tx.jobLog.create({
        data: {
          jobId,
          level: 'INFO',
          message: 'Job manually triggered for retry',
        },
      });

      return updatedJob;
    });

    this.metricsGateway.broadcastJobStateChange({
      jobId: updated.id,
      queueId: updated.queueId,
      projectId: updated.projectId,
      oldStatus: job.status,
      newStatus: JobStatus.QUEUED,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async delete(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    await this.prisma.$transaction([
      this.prisma.deadLetterQueue.updateMany({
        where: { jobId },
        data: { status: 'DELETED' },
      }),
      this.prisma.job.delete({
        where: { id: jobId },
      }),
    ]);

    return { success: true };
  }
}
