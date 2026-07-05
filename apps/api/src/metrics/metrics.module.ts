import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsGateway } from './metrics.gateway';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [MetricsService, MetricsGateway, PrismaService],
  controllers: [MetricsController],
  exports: [MetricsService, MetricsGateway],
})
export class MetricsModule {}
