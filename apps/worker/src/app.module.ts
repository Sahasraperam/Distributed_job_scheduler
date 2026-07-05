import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { WorkerService } from './worker.service';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      },
    }),
  ],
  providers: [WorkerService, PrismaService],
})
export class AppModule {}
