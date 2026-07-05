import { Module } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { QueuesController } from './queues.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [QueuesService, PrismaService],
  controllers: [QueuesController],
})
export class QueuesModule {}
