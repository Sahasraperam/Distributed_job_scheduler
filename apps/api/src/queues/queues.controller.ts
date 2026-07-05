import { Controller, Get, Post, Body, Param, Put, UseGuards, Query } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateQueueDto } from '@codity/shared';

@Controller('queues')
@UseGuards(JwtAuthGuard)
export class QueuesController {
  constructor(private queuesService: QueuesService) {}

  @Get()
  async getQueues(@Query('projectId') projectId: string) {
    return this.queuesService.findAll(projectId);
  }

  @Post()
  async createQueue(@Body() dto: CreateQueueDto) {
    return this.queuesService.create(dto);
  }

  @Put(':id/pause')
  async pauseQueue(@Param('id') id: string) {
    return this.queuesService.pause(id);
  }

  @Put(':id/resume')
  async resumeQueue(@Param('id') id: string) {
    return this.queuesService.resume(id);
  }
}
