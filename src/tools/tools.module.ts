import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { GrievancesModule } from '../grievances/grievances.module';
import { LabBookingsModule } from '../lab-bookings/lab-bookings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsModule } from '../requests/requests.module';
import { SeminarHallsModule } from '../seminar-halls/seminar-halls.module';
import { StudentsModule } from '../students/students.module';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  imports: [
    AuditModule,
    CertificatesModule,
    RequestsModule,
    NotificationsModule,
    LabBookingsModule,
    GrievancesModule,
    StudentsModule,
    SeminarHallsModule,
  ],
  providers: [ToolRegistryService, ToolExecutionService],
  exports: [ToolRegistryService, ToolExecutionService],
})
export class ToolsModule {}
