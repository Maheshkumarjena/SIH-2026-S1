import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { ApprovalsService } from './approvals.service';
import { RejectApprovalDto, RequestInfoDto } from './dto';

@UseGuards(MockJwtAuthGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  listPending(@CurrentUser() user: AuthenticatedUser) {
    return this.approvals.listPending(user);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.approvals.approve(id, user);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: RejectApprovalDto) {
    return this.approvals.reject(id, user, dto.reason);
  }

  @Post(':id/request-info')
  requestInfo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: RequestInfoDto) {
    return this.approvals.requestInfo(id, user, dto.question);
  }
}
