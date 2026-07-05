import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JobStatus } from '@codity/database';

@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  async getSystemMetrics(projectId: string) {
    // 1. Get all queues for project
    const queues = await this.prisma.queue.findMany({
      where: { projectId },
    });

    const queueMetrics = await Promise.all(
      queues.map(async (queue) => {
        // Group jobs by status
        const statusGroups = await this.prisma.job.groupBy({
          by: ['status'],
          where: { queueId: queue.id },
          _count: {
            id: true,
          },
        });

        const counts: Record<string, number> = {
          QUEUED: 0,
          SCHEDULED: 0,
          CLAIMED: 0,
          RUNNING: 0,
          COMPLETED: 0,
          FAILED: 0,
          DLQ: 0,
        };

        statusGroups.forEach((group) => {
          counts[group.status] = group._count.id;
        });

        // Compute average latency (execution time for COMPLETED jobs)
        const executionsAvg = await this.prisma.jobExecution.aggregate({
          where: {
            job: { queueId: queue.id },
            status: JobStatus.COMPLETED,
          },
          _avg: {
            durationMs: true,
          },
        });

        // Compute throughput (completed jobs in the last 5 minutes, scaled to /min)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const completedRecent = await this.prisma.jobExecution.count({
          where: {
            job: { queueId: queue.id },
            status: JobStatus.COMPLETED,
            endedAt: { gte: fiveMinAgo },
          },
        });
        const throughputPerMin = completedRecent / 5;

        return {
          queueId: queue.id,
          queueName: queue.name,
          queuedCount: counts.QUEUED,
          runningCount: counts.RUNNING + counts.CLAIMED,
          completedCount: counts.COMPLETED,
          failedCount: counts.FAILED,
          dlqCount: counts.DLQ,
          throughputPerMin,
          averageLatencyMs: Math.round(executionsAvg._avg.durationMs || 0),
        };
      })
    );

    // 2. Fetch Active Workers (heartbeat within 30 seconds)
    const thirtySecsAgo = new Date(Date.now() - 30 * 1000);
    const activeWorkers = await this.prisma.worker.findMany({
      where: {
        status: 'ACTIVE',
        updatedAt: { gte: thirtySecsAgo },
      },
      include: {
        heartbeats: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    const workersList = activeWorkers.map((worker) => {
      const lastHb = worker.heartbeats[0];
      return {
        workerId: worker.id,
        workerName: worker.name,
        hostname: worker.hostname,
        status: worker.status as 'ACTIVE' | 'OFFLINE',
        concurrency: worker.concurrency,
        runningJobsCount: lastHb?.runningJobsCount || 0,
        loadPercentage: lastHb?.loadPercentage || 0,
        updatedAt: worker.updatedAt.toISOString(),
      };
    });

    // 3. Overall Totals
    const totalQueued = queueMetrics.reduce((sum, q) => sum + q.queuedCount, 0);
    const totalRunning = queueMetrics.reduce((sum, q) => sum + q.runningCount, 0);
    const totalCompleted = queueMetrics.reduce((sum, q) => sum + q.completedCount, 0);
    const totalFailed = queueMetrics.reduce((sum, q) => sum + q.failedCount, 0);
    const totalDlq = queueMetrics.reduce((sum, q) => sum + q.dlqCount, 0);

    const totalThroughput = queueMetrics.reduce((sum, q) => sum + q.throughputPerMin, 0);

    const totalRuns = totalCompleted + totalFailed + totalDlq;
    const successRate = totalRuns > 0 ? (totalCompleted / totalRuns) * 100 : 100;
    const failureRate = totalRuns > 0 ? ((totalFailed + totalDlq) / totalRuns) * 100 : 0;

    return {
      queues: queueMetrics,
      workers: workersList,
      activeJobsCount: totalRunning,
      totalThroughput,
      successRate,
      failureRate,
      totals: {
        queued: totalQueued,
        running: totalRunning,
        completed: totalCompleted,
        failed: totalFailed,
        dlq: totalDlq,
      },
    };
  }
}
