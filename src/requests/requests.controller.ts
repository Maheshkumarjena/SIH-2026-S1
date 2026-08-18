import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { AuthenticatedUser } from '../common/types';
import { CreateRequestDto, UpdateRequestStatusDto } from './dto';
import { RequestsService } from './requests.service';

@UseGuards(MockJwtAuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRequestDto) {
    console.log(`[RequestsController.create] 📄 User ${user.id} (${user.role}) creating request of type: ${dto.request_type}`);
    const result = await this.requests.create(user.id, dto);
    console.log(`[RequestsController.create] ✅ Request created successfully:`, result?.id ?? 'done');
    return result;
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() filters: Record<string, string | undefined>) {
    console.log(`[RequestsController.list] 📋 User ${user.id} (${user.role}) listing requests with filters:`, filters);
    const result = await this.requests.list(user, filters);
    console.log(`[RequestsController.list] ✅ Returned ${result?.items?.length ?? 0} requests (total: ${result?.total ?? 0})`);
    return result;
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    console.log(`[RequestsController.get] 🔍 User ${user.id} (${user.role}) fetching request detail for: ${id}`);
    const result = await this.requests.getDetail(id, user);
    console.log(`[RequestsController.get] ✅ Fetched details for request: ${id}`);
    return result;
  }

  @Patch(':id/status')
  @Roles('staff', 'admin', 'warden', 'lab_incharge')
  async updateStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRequestStatusDto) {
    console.log(`[RequestsController.updateStatus] 🔄 User ${user.id} (${user.role}) updating status of request ${id} to '${dto.status}'`);
    const result = await this.requests.updateStatus(id, user, dto.status);
    console.log(`[RequestsController.updateStatus] ✅ Status updated successfully for request ${id}`);
    return result;
  }
}
