import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GrievancesModule } from '../grievances/grievances.module';
import { LabBookingsModule } from '../lab-bookings/lab-bookings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsModule } from '../requests/requests.module';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  imports: [AuditModule, RequestsModule, NotificationsModule, LabBookingsModule, GrievancesModule],
  providers: [ToolRegistryService, ToolExecutionService],
  exports: [ToolRegistryService, ToolExecutionService],
})
export class ToolsModule {}
