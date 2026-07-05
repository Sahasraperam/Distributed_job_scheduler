export interface CreateJobDto {
  name: string;
  payload: Record<string, any>;
  projectId: string;
  queueId: string;
  priority?: number;
  maxAttempts?: number;
  nextRunAt?: string; // ISO-8601 string for delayed/scheduled
  retryPolicyId?: string;
  batchId?: string;
  parentJobId?: string;
}

export interface CreateQueueDto {
  name: string;
  projectId: string;
  concurrencyLimit?: number;
}

export interface CreateScheduledJobDto {
  name: string;
  projectId: string;
  queueId: string;
  cronExpression: string;
  timezone?: string;
  payload: Record<string, any>;
}

export interface LoginDto {
  email: string;
  passwordHash: string; // Used in API context, or just 'password' as the raw login field
}

export interface RegisterDto {
  email: string;
  passwordRaw: string;
  firstName: string;
  lastName: string;
}

// Websocket Real-time payloads
export interface QueueMetrics {
  queueId: string;
  queueName: string;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  dlqCount: number;
  throughputPerMin: number;
  averageLatencyMs: number;
}

export interface WorkerStatusPayload {
  workerId: string;
  workerName: string;
  hostname: string;
  status: 'ACTIVE' | 'OFFLINE';
  concurrency: number;
  runningJobsCount: number;
  loadPercentage: number;
  updatedAt: string;
}

export interface SystemMetricsPayload {
  queues: QueueMetrics[];
  workers: WorkerStatusPayload[];
  activeJobsCount: number;
  totalThroughput: number;
  successRate: number;
  failureRate: number;
}

export interface LiveJobLogPayload {
  jobId: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface JobStateChangePayload {
  jobId: string;
  queueId: string;
  projectId: string;
  oldStatus: string;
  newStatus: string;
  timestamp: string;
}
