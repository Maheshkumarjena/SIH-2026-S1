import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { CreateRequestDto, UpdateRequestStatusDto } from './dto';
import { RequestsService } from './requests.service';

@UseGuards(MockJwtAuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRequestDto) {
    return this.requests.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() filters: Record<string, string | undefined>) {
    return this.requests.list(user, filters);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.requests.getDetail(id, user);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRequestStatusDto) {
    return this.requests.updateStatus(id, user, dto.status);
  }
}
