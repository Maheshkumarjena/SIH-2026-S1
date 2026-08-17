import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { FileGrievanceDto } from './dto';
import { GrievancesService } from './grievances.service';

@UseGuards(MockJwtAuthGuard)
@Controller('grievances')
export class GrievancesController {
  constructor(private readonly grievances: GrievancesService) {}

  @Post()
  file(@CurrentUser() user: AuthenticatedUser, @Body() dto: FileGrievanceDto): Promise<unknown> {
    return this.grievances.file(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() filters: Record<string, string | undefined>): Promise<unknown> {
    return this.grievances.list(user, filters);
  }

  @Get(':id')
  getDetail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.grievances.getDetail(id, user);
  }

  @Post(':id/escalate')
  escalate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.grievances.escalate(id, user);
  }
}
