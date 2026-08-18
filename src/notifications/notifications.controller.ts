import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { NotificationsService } from './notifications.service';

@UseGuards(MockJwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() filters: Record<string, string | undefined>) {
    console.log(`[NotificationsController.list] 🔔 User ${user.id} (${user.role}) listing notifications with filters:`, filters);
    const result = await this.notifications.list(user.id, filters);
    console.log(`[NotificationsController.list] ✅ Returned ${result?.items?.length ?? 0} notifications (total: ${result?.total ?? 0})`);
    return result;
  }

  @Post('mark-read')
  async markRead(@CurrentUser() user: AuthenticatedUser, @Body() dto: { ids?: string[] }) {
    console.log(`[NotificationsController.markRead] ✔️ User ${user.id} marking notifications as read (count: ${dto.ids?.length ?? 'all'})`);
    const result = await this.notifications.markRead(user.id, dto.ids);
    console.log(`[NotificationsController.markRead] ✅ Notifications marked as read`);
    return result;
  }
}
