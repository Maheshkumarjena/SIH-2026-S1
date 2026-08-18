import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { AuthenticatedUser } from '../common/types';
import { ApprovalsService } from './approvals.service';
import { RejectApprovalDto, RequestInfoDto } from './dto';

@UseGuards(MockJwtAuthGuard)
@Roles('staff', 'admin', 'warden', 'lab_incharge')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  async listPending(@CurrentUser() user: AuthenticatedUser) {
    console.log(`[ApprovalsController.listPending] 📋 Approver ${user.id} (${user.role}) listing pending approvals`);
    const result = await this.approvals.listPending(user);
    console.log(`[ApprovalsController.listPending] ✅ Found ${result?.items?.length ?? 0} pending approvals`);
    return result;
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    console.log(`[ApprovalsController.approve] 👍 Approver ${user.id} (${user.role}) approving request: ${id}`);
    const result = await this.approvals.approve(id, user);
    console.log(`[ApprovalsController.approve] ✅ Request ${id} approved successfully`);
    return result;
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: RejectApprovalDto) {
    console.log(`[ApprovalsController.reject] 👎 Approver ${user.id} (${user.role}) rejecting request ${id} with reason: "${dto.reason}"`);
    const result = await this.approvals.reject(id, user, dto.reason);
    console.log(`[ApprovalsController.reject] ✅ Request ${id} rejected successfully`);
    return result;
  }

  @Post(':id/request-info')
  async requestInfo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: RequestInfoDto) {
    console.log(`[ApprovalsController.requestInfo] ❓ Approver ${user.id} (${user.role}) requesting info for request ${id}: "${dto.question}"`);
    const result = await this.approvals.requestInfo(id, user, dto.question);
    console.log(`[ApprovalsController.requestInfo] ✅ Info requested for request ${id}`);
    return result;
  }
}
