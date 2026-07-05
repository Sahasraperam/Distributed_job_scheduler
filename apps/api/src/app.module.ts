import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { QueuesModule } from './queues/queues.module';
import { JobsModule } from './jobs/jobs.module';
import { MetricsModule } from './metrics/metrics.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      },
    }),
    AuthModule,
    QueuesModule,
    JobsModule,
    MetricsModule,
    SchedulerModule,
  ],
})
export class AppModule {}
