import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {}

  async create(userId: string, notification: { title: string; body: string; deepLink?: string }): Promise<void> {
    const created = await this.prisma.notification.create({
      data: {
        userId,
        title: notification.title,
        body: notification.body,
        deepLink: notification.deepLink,
      },
    });
    this.events.emitToUser(userId, 'notification.new', { notification: created });
  }

  async list(userId: string, filters: Record<string, string | undefined>) {
    const page = Math.max(Number(filters.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(filters.limit ?? 20), 1), 100);
    const where = {
      userId,
      ...(filters.unread_only === 'true' ? { readFlag: false } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page };
  }

  async markRead(userId: string, ids?: string[]) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, ...(ids && ids.length > 0 ? { id: { in: ids } } : {}) },
      data: { readFlag: true },
    });
    return { updated: result.count };
  }
}
