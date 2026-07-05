import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { PrismaService } from '../prisma.service';
import { MetricsGateway } from '../metrics/metrics.gateway';

@Module({
  providers: [JobsService, PrismaService, MetricsGateway],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
