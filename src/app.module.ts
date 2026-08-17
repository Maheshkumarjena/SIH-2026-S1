import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';
import { AuthModule } from './auth/auth.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuditModule } from './audit/audit.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { LabBookingsModule } from './lab-bookings/lab-bookings.module';
import { LlmModule } from './llm/llm.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RequestsModule } from './requests/requests.module';
import { ToolsModule } from './tools/tools.module';
import { GrievancesModule } from './grievances/grievances.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PrismaModule,
    AuditModule,
    RealtimeModule,
    NotificationsModule,
    RequestsModule,
    LabBookingsModule,
    GrievancesModule,
    AdminAnalyticsModule,
    KnowledgeBaseModule,
    LlmModule,
    ToolsModule,
    ApprovalsModule,
    AgentModule,
  ],
})
export class AppModule {}
