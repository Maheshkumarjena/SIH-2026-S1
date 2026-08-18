import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { AuditService } from './audit.service';

@UseGuards(MockJwtAuthGuard)
@Roles('admin')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('search')
  async search(@Query() filters: Record<string, string | undefined>) {
    console.log(`[AuditController.search] 🔍 Searching audit logs with filters:`, filters);
    const result = await this.audit.search(filters);
    console.log(`[AuditController.search] ✅ Returned ${result?.items?.length ?? 0} audit logs (total: ${result?.total ?? 0})`);
    return result;
  }

  @Get('verify/:entityType/:entityId')
  async verify(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    console.log(`[AuditController.verify] 🔒 Verifying hash chain integrity for entity: ${entityType}/${entityId}`);
    const result = await this.audit.verifyChain(entityType, entityId);
    console.log(`[AuditController.verify] ✅ Hash chain verification result:`, result);
    return result;
  }

  @Get(':entityType/:entityId')
  async getForEntity(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    console.log(`[AuditController.getForEntity] 📜 Fetching audit trail for entity: ${entityType}/${entityId}`);
    const result = await this.audit.getForEntity(entityType, entityId);
    console.log(`[AuditController.getForEntity] ✅ Fetched ${Array.isArray(result) ? result.length : 0} audit trail entries`);
    return result;
  }
}
