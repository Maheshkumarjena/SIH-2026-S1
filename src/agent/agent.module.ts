import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { LlmModule } from '../llm/llm.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RequestsModule } from '../requests/requests.module';
import { ToolsModule } from '../tools/tools.module';
import { AgentController } from './agent.controller';
import { AgentOrchestrationService } from './agent-orchestration.service';
import { AgentSessionsService } from './agent-sessions.service';
import { GuardrailService } from './guardrails/guardrail.service';
import { NluService } from './nlu.service';
import { PlannerService } from './planner.service';
import { RiskClassificationService } from './risk/risk-classification.service';

@Module({
  imports: [AuditModule, LlmModule, KnowledgeBaseModule, ToolsModule, ApprovalsModule, RealtimeModule, RequestsModule],
  controllers: [AgentController],
  providers: [
    AgentSessionsService,
    AgentOrchestrationService,
    NluService,
    PlannerService,
    GuardrailService,
    RiskClassificationService,
  ],
  exports: [AgentSessionsService, AgentOrchestrationService],
})
export class AgentModule {}
