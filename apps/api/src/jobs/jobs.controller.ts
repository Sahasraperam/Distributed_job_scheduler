import { Controller, Get, Post, Body, Param, Delete, Put, UseGuards, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateJobDto, CreateScheduledJobDto } from '@codity/shared';
import { JobStatus } from '@codity/database';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post()
  async createJob(@Body() dto: CreateJobDto) {
    return this.jobsService.create(dto);
  }

  @Post('recurring')
  async createRecurring(@Body() dto: CreateScheduledJobDto) {
    return this.jobsService.createRecurring(dto);
  }

  @Get()
  async getJobs(
    @Query('projectId') projectId: string,
    @Query('queueId') queueId?: string,
    @Query('status') status?: JobStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.jobsService.findAll(
      projectId,
      { queueId, status, search },
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10
    );
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Get(':id/logs')
  async getJobLogs(@Param('id') id: string) {
    return this.jobsService.getLogs(id);
  }

  @Put(':id/retry')
  async retryJob(@Param('id') id: string) {
    return this.jobsService.retry(id);
  }

  @Delete(':id')
  async deleteJob(@Param('id') id: string) {
    return this.jobsService.delete(id);
  }
}
