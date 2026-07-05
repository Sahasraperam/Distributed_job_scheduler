import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateQueueDto } from '@codity/shared';

@Injectable()
export class QueuesService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.queue.findMany({
      where: { projectId },
      include: {
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });
  }

  async create(dto: CreateQueueDto) {
    return this.prisma.queue.create({
      data: {
        name: dto.name,
        projectId: dto.projectId,
        concurrencyLimit: dto.concurrencyLimit || 10,
      },
    });
  }

  async pause(queueId: string) {
    const queue = await this.prisma.queue.findUnique({ where: { id: queueId } });
    if (!queue) throw new NotFoundException('Queue not found');

    return this.prisma.queue.update({
      where: { id: queueId },
      data: { isPaused: true },
    });
  }

  async resume(queueId: string) {
    const queue = await this.prisma.queue.findUnique({ where: { id: queueId } });
    if (!queue) throw new NotFoundException('Queue not found');

    return this.prisma.queue.update({
      where: { id: queueId },
      data: { isPaused: false },
    });
  }
}
