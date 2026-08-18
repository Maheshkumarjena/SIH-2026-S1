import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { AuthenticatedUser } from '../common/types';
import { FileGrievanceDto } from './dto';
import { GrievancesService } from './grievances.service';

@UseGuards(MockJwtAuthGuard)
@Controller('grievances')
export class GrievancesController {
  constructor(private readonly grievances: GrievancesService) {}

  @Post()
  async file(@CurrentUser() user: AuthenticatedUser, @Body() dto: FileGrievanceDto): Promise<unknown> {
    console.log(`[GrievancesController.file] 📢 User ${user.id} (${user.role}) filing grievance (Category: ${dto.category}, Anonymous: ${dto.anonymous})`);
    const result = await this.grievances.file(user, dto);
    console.log(`[GrievancesController.file] ✅ Grievance filed successfully:`, (result as { id?: string })?.id ?? 'done');
    return result;
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() filters: Record<string, string | undefined>): Promise<unknown> {
    console.log(`[GrievancesController.list] 📋 User ${user.id} (${user.role}) listing grievances with filters:`, filters);
    const result = await this.grievances.list(user, filters);
    console.log(`[GrievancesController.list] ✅ Returned ${(result as { items?: unknown[] })?.items?.length ?? 0} grievances`);
    return result;
  }

  @Get(':id')
  async getDetail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    console.log(`[GrievancesController.getDetail] 🔍 User ${user.id} (${user.role}) fetching grievance details: ${id}`);
    const result = await this.grievances.getDetail(id, user);
    console.log(`[GrievancesController.getDetail] ✅ Fetched grievance details: ${id}`);
    return result;
  }

  @Post(':id/escalate')
  @Roles('staff', 'admin', 'warden')
  async escalate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    console.log(`[GrievancesController.escalate] ⚡ User ${user.id} (${user.role}) escalating grievance: ${id}`);
    const result = await this.grievances.escalate(id, user);
    console.log(`[GrievancesController.escalate] ✅ Grievance ${id} escalated successfully`);
    return result;
  }
}
