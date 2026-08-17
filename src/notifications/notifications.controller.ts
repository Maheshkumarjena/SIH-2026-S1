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
  list(@CurrentUser() user: AuthenticatedUser, @Query() filters: Record<string, string | undefined>) {
    return this.notifications.list(user.id, filters);
  }

  @Post('mark-read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Body() dto: { ids?: string[] }) {
    return this.notifications.markRead(user.id, dto.ids);
  }
}
