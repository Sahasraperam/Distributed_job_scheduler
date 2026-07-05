import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JobStatus, Job, RetryType, Queue } from '@codity/database';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Simple mock task executors
const PROCESSORS: Record<string, (payload: any, log: (msg: string) => void) => Promise<any>> = {
  send_email: async (payload, log) => {
    log(`Starting email send to: ${payload.to || 'unknown@example.com'}`);
    await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate async email sending
    if (payload.fail) {
      throw new Error('SMTP Connection Timeout');
    }
    log(`Email successfully sent to: ${payload.to}`);
    return { sent: true, provider: 'smtp-relay' };
  },
  generate_report: async (payload, log) => {
    log(`Initializing report generation: ${payload.reportName || 'System Audit'}`);
    for (let i = 20; i <= 100; i += 20) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      log(`Report progress: ${i}%`);
    }
    if (payload.fail) {
      throw new Error('Database connection lost during fetch');
    }
    log('Report successfully compiled and uploaded.');
    return { url: `https://storage.codity.com/reports/${uuidv4()}.pdf` };
  },
  webhook_trigger: async (payload, log) => {
    log(`Triggering webhook POST payload to: ${payload.url || 'http://callback.org'}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (payload.fail) {
      throw new Error('HTTP Status Code: 502 Bad Gateway');
    }
    log('Webhook acknowledged by endpoint with 200 OK.');
    return { status: 200 };
  },
};

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private workerId!: string;
  private workerName!: string;
  private concurrencyLimit = 5;
  private pollIntervalMs = 1000;
  private heartbeatIntervalMs = 5000;
  private activeJobsCount = 0;
  private isShuttingDown = false;
  private pollTimeout?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {
    this.workerId = uuidv4();
    this.workerName = `worker-${os.hostname()}-${process.pid}`;
    const envConcurrency = process.env.WORKER_CONCURRENCY;
    if (envConcurrency) {
      this.concurrencyLimit = parseInt(envConcurrency);
    }
  }

  async onModuleInit() {
    this.logger.log(`Initializing Worker: ${this.workerName} with concurrency: ${this.concurrencyLimit}`);
    await this.registerWorker();
    this.startHeartbeatLoop();
    this.startClaimLoop();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  private async registerWorker() {
    await this.prisma.worker.upsert({
      where: { name: this.workerName },
      update: {
        id: this.workerId,
        hostname: os.hostname(),
        concurrency: this.concurrencyLimit,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
      create: {
        id: this.workerId,
        name: this.workerName,
        hostname: os.hostname(),
        concurrency: this.concurrencyLimit,
        status: 'ACTIVE',
      },
    });
    this.logger.log(`Worker registered successfully in database with ID: ${this.workerId}`);
  }

  private startHeartbeatLoop() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const load = (this.activeJobsCount / this.concurrencyLimit) * 100;
        await this.prisma.$transaction([
          this.prisma.worker.update({
            where: { id: this.workerId },
            data: { updatedAt: new Date(), status: 'ACTIVE' },
          }),
          this.prisma.workerHeartbeat.create({
            data: {
              workerId: this.workerId,
              loadPercentage: load,
              runningJobsCount: this.activeJobsCount,
            },
          }),
        ]);
      } catch (e) {
        this.logger.error('Failed to write worker heartbeat:', e);
      }
    }, this.heartbeatIntervalMs);
  }

  private startClaimLoop() {
    if (this.isShuttingDown) return;

    this.pollTimeout = setTimeout(async () => {
      try {
        await this.claimAndExecuteJobs();
      } catch (e) {
        this.logger.error('Error during job claim/execute cycle:', e);
      } finally {
        this.startClaimLoop();
      }
    }, this.pollIntervalMs);
  }

  private async claimAndExecuteJobs() {
    if (this.isShuttingDown || this.activeJobsCount >= this.concurrencyLimit) {
      return;
    }

    // 1. Get all active queues in the system
    const activeQueues = await this.prisma.queue.findMany({
      where: { isPaused: false },
    });

    for (const queue of activeQueues) {
      if (this.activeJobsCount >= this.concurrencyLimit) {
        break; // Reached maximum local concurrency
      }

      // 2. Enforce global queue concurrency limits
      const runningJobsForQueue = await this.prisma.job.count({
        where: {
          queueId: queue.id,
          status: { in: [JobStatus.CLAIMED, JobStatus.RUNNING] },
        },
      });

      if (runningJobsForQueue >= queue.concurrencyLimit) {
        continue; // Skip this queue, it is currently saturated globally
      }

      const capacity = Math.min(
        this.concurrencyLimit - this.activeJobsCount,
        queue.concurrencyLimit - runningJobsForQueue
      );

      for (let i = 0; i < capacity; i++) {
        const job = await this.claimJobAtomic(queue.id);
        if (!job) {
          break; // No more QUEUED jobs in this queue
        }

        // Increment active count and spawn execution asynchronously
        this.activeJobsCount++;
        this.executeJob(job).catch((err) => {
          this.logger.error(`Unhandled execution crash for Job ID ${job.id}:`, err);
        });
      }
    }
  }

  private async claimJobAtomic(queueId: string): Promise<Job | null> {
    try {
      // Execute the atomic SELECT FOR UPDATE SKIP LOCKED query inside a transaction
      return await this.prisma.$transaction(async (tx) => {
        // Find the top priority job in queue that is ready to run
        const rawJobs: Job[] = await tx.$queryRawUnsafe(
          `SELECT * FROM "Job"
           WHERE "status" = 'QUEUED'
             AND "queueId" = $1
             AND "nextRunAt" <= NOW()
           ORDER BY "priority" DESC, "nextRunAt" ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          queueId
        );

        if (!rawJobs || rawJobs.length === 0) {
          return null;
        }

        const job = rawJobs[0];

        // Update its status to CLAIMED
        const updated = await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.CLAIMED,
            workerId: this.workerId,
            attemptsMade: { increment: 1 },
            updatedAt: new Date(),
          },
        });

        return updated;
      });
    } catch (e) {
      this.logger.error(`Claim transaction failed for queue ${queueId}:`, e);
      return null;
    }
  }

  private async executeJob(job: Job) {
    const startTime = Date.now();
    let executionId = '';

    const logFn = async (message: string) => {
      this.logger.log(`[Job ${job.id}] ${message}`);
      await this.prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: 'INFO',
          message,
        },
      });
    };

    try {
      // Update status to RUNNING
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.RUNNING, updatedAt: new Date() },
      });

      // Record Job Execution Start
      const exec = await this.prisma.jobExecution.create({
        data: {
          jobId: job.id,
          workerId: this.workerId,
          status: JobStatus.RUNNING,
          startedAt: new Date(),
        },
      });
      executionId = exec.id;

      await logFn(`Started execution on worker ${this.workerName}`);

      // Locate appropriate processor
      const processor = PROCESSORS[job.name];
      let resultPayload: any = {};
      if (!processor) {
        throw new Error(`No registered processor found for job name: ${job.name}`);
      }

      // Run processor logic
      resultPayload = await processor(job.payload, logFn);

      // Handle Success
      const endTime = Date.now();
      const duration = endTime - startTime;

      await this.prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await tx.jobExecution.update({
          where: { id: executionId },
          data: {
            status: JobStatus.COMPLETED,
            endedAt: new Date(),
            durationMs: duration,
          },
        });

        await tx.jobLog.create({
          data: {
            jobId: job.id,
            level: 'INFO',
            message: `Job completed successfully in ${duration}ms.`,
          },
        });
      });

      await this.promoteChildJobs(job.id);

    } catch (error: any) {
      // Handle Failure
      const endTime = Date.now();
      const duration = endTime - startTime;
      const errorMessage = error?.message || String(error);

      this.logger.warn(`Job ${job.id} failed: ${errorMessage}`);

      try {
        await this.handleJobFailure(job, executionId, errorMessage, duration);
      } catch (failErr) {
        this.logger.error(`Critical error while handling job failure logic for ${job.id}:`, failErr);
      }
    } finally {
      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
    }
  }

  private async promoteChildJobs(parentJobId: string) {
    // Look up jobs blocked by this parent
    const children = await this.prisma.job.findMany({
      where: {
        parentJobId,
        status: JobStatus.SCHEDULED,
      },
    });

    for (const child of children) {
      // A child job might have multiple parent jobs. Check if all of them are completed.
      // In this basic parentJobId model, there is a single parent. So we can promote it directly!
      await this.prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: child.id },
          data: {
            status: JobStatus.QUEUED,
            nextRunAt: new Date(),
            updatedAt: new Date(),
          },
        });
        await tx.jobLog.create({
          data: {
            jobId: child.id,
            level: 'INFO',
            message: `Parent job ${parentJobId} completed. Promoted child job to QUEUED.`,
          },
        });
      });
    }
  }

  private async handleJobFailure(
    job: Job,
    executionId: string,
    errorMsg: string,
    durationMs: number
  ) {
    const attempts = job.attemptsMade;
    const maxAttempts = job.maxAttempts;

    // Fetch Retry Policy if configured
    let retryDelay = 2000; // default 2 seconds
    if (job.retryPolicyId) {
      const policy = await this.prisma.retryPolicy.findUnique({
        where: { id: job.retryPolicyId },
      });
      if (policy) {
        if (policy.type === RetryType.FIXED) {
          retryDelay = policy.delayMs;
        } else if (policy.type === RetryType.LINEAR) {
          retryDelay = policy.delayMs * attempts;
        } else if (policy.type === RetryType.EXPONENTIAL) {
          retryDelay = Math.round(policy.delayMs * Math.pow(policy.backoffFactor, attempts - 1));
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update the current execution log in DB
      if (executionId) {
        await tx.jobExecution.update({
          where: { id: executionId },
          data: {
            status: JobStatus.FAILED,
            endedAt: new Date(),
            durationMs,
            error: errorMsg,
          },
        });
      }

      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: 'ERROR',
          message: `Attempt ${attempts}/${maxAttempts} failed: ${errorMsg}`,
        },
      });

      if (attempts < maxAttempts) {
        // Schedule retry
        const nextRun = new Date(Date.now() + retryDelay);
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.QUEUED,
            nextRunAt: nextRun,
            updatedAt: new Date(),
          },
        });
        await tx.jobLog.create({
          data: {
            jobId: job.id,
            level: 'INFO',
            message: `Retrying job in ${retryDelay}ms (Next run: ${nextRun.toISOString()})`,
          },
        });
      } else {
        // Move to DLQ
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.DLQ,
            failedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await tx.deadLetterQueue.create({
          data: {
            jobId: job.id,
            queueId: job.queueId,
            failureReason: errorMsg,
            payload: job.payload || {},
            retryCount: attempts,
          },
        });

        await tx.jobLog.create({
          data: {
            jobId: job.id,
            level: 'FATAL',
            message: `Max retries (${maxAttempts}) reached. Job relocated to Dead Letter Queue (DLQ).`,
          },
        });
      }
    });
  }

  public async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.logger.log('Graceful shutdown initiated. Worker stopping claiming loops...');

    // Stop claiming timer
    if (this.pollTimeout) clearTimeout(this.pollTimeout);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Wait for active jobs to complete (max 15 seconds)
    const timeout = 15000;
    const checkInterval = 200;
    let timeElapsed = 0;

    while (this.activeJobsCount > 0 && timeElapsed < timeout) {
      this.logger.log(`Waiting for ${this.activeJobsCount} active jobs to terminate...`);
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      timeElapsed += checkInterval;
    }

    if (this.activeJobsCount > 0) {
      this.logger.warn(`Graceful shutdown timed out. ${this.activeJobsCount} jobs still running.`);
    } else {
      this.logger.log('All active jobs finished.');
    }

    try {
      // Mark worker offline
      await this.prisma.worker.update({
        where: { id: this.workerId },
        data: { status: 'OFFLINE' },
      });
      this.logger.log('Worker marked OFFLINE in database.');
    } catch (e) {
      this.logger.error('Failed to mark worker offline during shutdown:', e);
    }
  }
}
