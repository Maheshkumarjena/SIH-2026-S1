import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuditService } from './audit.service';

@UseGuards(MockJwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('search')
  search(@Query() filters: Record<string, string | undefined>) {
    return this.audit.search(filters);
  }

  @Get('verify/:entityType/:entityId')
  verify(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.audit.verifyChain(entityType, entityId);
  }

  @Get(':entityType/:entityId')
  getForEntity(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.audit.getForEntity(entityType, entityId);
  }
}
