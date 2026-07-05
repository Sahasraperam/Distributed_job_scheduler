import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JobStatus, ScheduledJob } from '@codity/database';
import { MetricsGateway } from '../metrics/metrics.gateway';
import * as cronParser from 'cron-parser';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private promotionInterval?: NodeJS.Timeout;
  private cronInterval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private metricsGateway: MetricsGateway
  ) {}

  onModuleInit() {
    this.logger.log('Starting background Scheduler engines...');
    
    // Promote delayed/scheduled jobs to QUEUED every 2 seconds
    this.promotionInterval = setInterval(() => this.promoteDelayedJobs(), 2000);

    // Process cron triggers (recurring jobs) every 5 seconds
    this.cronInterval = setInterval(() => this.processCronTriggers(), 5000);

    // Run recovery loop for stale workers every 10 seconds
    this.recoveryInterval = setInterval(() => this.recoverAbandonedJobs(), 10000);
  }

  onModuleDestroy() {
    if (this.promotionInterval) clearInterval(this.promotionInterval);
    if (this.cronInterval) clearInterval(this.cronInterval);
    if (this.recoveryInterval) clearInterval(this.recoveryInterval);
  }

  /**
   * Scans for jobs with status=SCHEDULED that have passed their nextRunAt time.
   * Promotes them to status=QUEUED.
   */
  async promoteDelayedJobs() {
    try {
      const now = new Date();
      
      // Update jobs in batch to avoid locking overhead
      const updated = await this.prisma.job.updateMany({
        where: {
          status: JobStatus.SCHEDULED,
          nextRunAt: { lte: now },
        },
        data: {
          status: JobStatus.QUEUED,
          updatedAt: now,
        },
      });

      if (updated.count > 0) {
        this.logger.log(`Promoted ${updated.count} delayed jobs to QUEUED.`);
        
        // Notify dashboard of changes
        this.metricsGateway.broadcastJobStateChange({
          jobId: 'ALL',
          queueId: 'ALL',
          projectId: 'ALL',
          oldStatus: JobStatus.SCHEDULED,
          newStatus: JobStatus.QUEUED,
          timestamp: now.toISOString(),
        });
      }
    } catch (e) {
      this.logger.error('Failed to promote delayed jobs:', e);
    }
  }

  /**
   * Claims and processes recurring cron configurations (ScheduledJob) atomically.
   */
  async processCronTriggers() {
    try {
      const now = new Date();

      // Perform transaction to query and lock matching triggers
      await this.prisma.$transaction(async (tx) => {
        // Query triggers needing execution using native locking
        const rawTriggers: ScheduledJob[] = await tx.$queryRaw`
          SELECT * FROM "ScheduledJob"
          WHERE "isActive" = true AND "nextRunAt" <= ${now}
          FOR UPDATE SKIP LOCKED
        `;

        for (const trigger of rawTriggers) {
          // 1. Calculate next execution time using cron-parser
          let nextRunAt: Date;
          try {
            const interval = cronParser.parseExpression(trigger.cronExpression, { tz: trigger.timezone });
            nextRunAt = interval.next().toDate();
          } catch (err) {
            this.logger.error(`Invalid cron configuration for trigger ${trigger.id}, disabling.`, err);
            await tx.scheduledJob.update({
              where: { id: trigger.id },
              data: { isActive: false },
            });
            continue;
          }

          // 2. Create the actual concrete job
          const concreteJob = await tx.job.create({
            data: {
              projectId: trigger.projectId,
              queueId: trigger.queueId,
              name: trigger.name,
              payload: trigger.payload || {},
              status: JobStatus.QUEUED,
              priority: 0,
              nextRunAt: new Date(),
              scheduledJobId: trigger.id,
            },
          });

          // 3. Update Cron trigger fields
          await tx.scheduledJob.update({
            where: { id: trigger.id },
            data: {
              lastRunAt: new Date(),
              nextRunAt: nextRunAt,
              updatedAt: new Date(),
            },
          });

          // Write a log for the job
          await tx.jobLog.create({
            data: {
              jobId: concreteJob.id,
              level: 'INFO',
              message: `Concrete job scheduled by recurring trigger: ${trigger.name}`,
            },
          });

          this.logger.log(`Created cron job ${concreteJob.id} from trigger: ${trigger.name}`);

          this.metricsGateway.broadcastJobStateChange({
            jobId: concreteJob.id,
            queueId: concreteJob.queueId,
            projectId: concreteJob.projectId,
            oldStatus: 'CRON',
            newStatus: JobStatus.QUEUED,
            timestamp: new Date().toISOString(),
          });
        }
      });
    } catch (e) {
      this.logger.error('Failed processing cron triggers:', e);
    }
  }

  /**
   * Scans for active workers that missed heartbeats. Relocates active tasks back to queue.
   */
  async recoverAbandonedJobs() {
    try {
      const now = new Date();
      const staleThreshold = new Date(now.getTime() - 30 * 1000); // 30 seconds ago

      // 1. Locate workers that missed heartbeat
      const staleWorkers = await this.prisma.worker.findMany({
        where: {
          status: 'ACTIVE',
          updatedAt: { lt: staleThreshold },
        },
      });

      for (const worker of staleWorkers) {
        this.logger.warn(`Worker ${worker.name} (ID: ${worker.id}) missed heartbeat. Recovering active tasks...`);

        // Update worker status to OFFLINE
        await this.prisma.worker.update({
          where: { id: worker.id },
          data: { status: 'OFFLINE', updatedAt: now },
        });

        // 2. Fetch jobs assigned to worker that are in CLAIMED or RUNNING
        const abandonedJobs = await this.prisma.job.findMany({
          where: {
            workerId: worker.id,
            status: { in: [JobStatus.CLAIMED, JobStatus.RUNNING] },
          },
        });

        for (const job of abandonedJobs) {
          await this.prisma.$transaction(async (tx) => {
            await tx.jobLog.create({
              data: {
                jobId: job.id,
                level: 'WARNING',
                message: `Worker ${worker.name} failed during run. Recovering task...`,
              },
            });

            if (job.attemptsMade < job.maxAttempts) {
              // Reset status back to QUEUED so another worker can take it
              await tx.job.update({
                where: { id: job.id },
                data: {
                  status: JobStatus.QUEUED,
                  nextRunAt: now,
                  workerId: null,
                  updatedAt: now,
                },
              });

              await tx.jobLog.create({
                data: {
                  jobId: job.id,
                  level: 'INFO',
                  message: `Job recovered and returned to QUEUED (Attempt ${job.attemptsMade}/${job.maxAttempts})`,
                },
              });
            } else {
              // Exceeded attempts limit, move to DLQ
              await tx.job.update({
                where: { id: job.id },
                data: {
                  status: JobStatus.DLQ,
                  failedAt: now,
                  workerId: null,
                  updatedAt: now,
                },
              });

              await tx.deadLetterQueue.create({
                data: {
                  jobId: job.id,
                  queueId: job.queueId,
                  failureReason: 'Worker offline / heartbeat missed during execution',
                  payload: job.payload || {},
                  retryCount: job.attemptsMade,
                },
              });

              await tx.jobLog.create({
                data: {
                  jobId: job.id,
                  level: 'FATAL',
                  message: 'Max execution limits reached during recovery. Moved to DLQ.',
                },
              });
            }
          });

          this.metricsGateway.broadcastJobStateChange({
            jobId: job.id,
            queueId: job.queueId,
            projectId: job.projectId,
            oldStatus: job.status,
            newStatus: job.attemptsMade < job.maxAttempts ? JobStatus.QUEUED : JobStatus.DLQ,
            timestamp: now.toISOString(),
          });
        }
      }
    } catch (e) {
      this.logger.error('Failed recovering abandoned jobs:', e);
    }
  }
}
