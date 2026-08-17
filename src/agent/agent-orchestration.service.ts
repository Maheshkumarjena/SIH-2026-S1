import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { HashChainService } from '../audit/hash-chain.service';
import { AgentMessage, AgentState, AuthenticatedUser, Intent, PlanStep, RiskLevel } from '../common/types';
import { RetrievalService } from '../knowledge-base/retrieval.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';
import { RequestsService } from '../requests/requests.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { GuardrailService } from './guardrails/guardrail.service';
import { NluService } from './nlu.service';
import { PlannerService } from './planner.service';
import { RiskClassificationService } from './risk/risk-classification.service';

@Injectable()
export class AgentOrchestrationService {
  private readonly logger = new Logger(AgentOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nlu: NluService,
    private readonly retrieval: RetrievalService,
    private readonly guardrails: GuardrailService,
    private readonly planner: PlannerService,
    private readonly risk: RiskClassificationService,
    private readonly tools: ToolExecutionService,
    private readonly approvals: ApprovalsService,
    private readonly audit: HashChainService,
    private readonly events: EventDispatcherService,
    private readonly requests: RequestsService,
    private readonly config: ConfigService,
  ) {}

  async runGraph(sessionId: string, user: AuthenticatedUser, rawInput: string): Promise<void> {
    const started = Date.now();
    this.logger.log({ session_id: sessionId, user_id: user.id, node: 'ENTRY', status: 'start' });
    try {
      const state = await this.initializeState(sessionId, user, rawInput);
      await this.detectLanguage(state);
      await this.identityCheck(state);
      await this.classifyIntent(state);
      await this.guardrailInputScreen(state);
      await this.retrieve(state);
      await this.guardrailDocScreen(state);
      const confident = await this.confidenceGate(state);
      if (!confident) {
        await this.askForClarification(state);
        return;
      }
      await this.generatePlan(state);
      const noConflict = await this.policyConflictCheck(state);
      if (!noConflict) {
        await this.flagAdminQueue(state);
        return;
      }
      await this.riskClassifySteps(state);
      await this.stepLoop(state);
      if (state.pending_approval_id) {
        return;
      }
      await this.notifyUser(state);
      await this.finalAudit(state);
      this.logger.log({ session_id: sessionId, user_id: user.id, node: 'END', duration: Date.now() - started, status: 'complete' });
    } catch (error) {
      await this.handleFailure(sessionId, error);
    }
  }

  private async initializeState(sessionId: string, user: AuthenticatedUser, rawInput: string): Promise<AgentState> {
    const history = await this.prisma.agentMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return {
      session_id: sessionId,
      user,
      raw_input: rawInput,
      detected_language: user.preferred_language,
      intent: 'general_query',
      entities: {},
      retrieved_chunks: [],
      retrieval_confidence: 0,
      plan: [],
      current_step_index: 0,
      guardrail_flags: [],
      pending_approval_id: null,
      clarification_rounds: 0,
      retry_counts: {},
      conversation_history: history.map((message): AgentMessage => ({
        id: message.id,
        sender: message.sender as AgentMessage['sender'],
        content: message.content,
        confidence_score: message.confidenceScore,
        cited_chunk_ids: message.citedChunkIds,
        created_at: message.createdAt,
      })),
      final_response: null,
      error: null,
    };
  }

  private async detectLanguage(state: AgentState): Promise<void> {
    state.detected_language = await this.nlu.detectLanguage(state.raw_input, state.session_id);
    await this.audit.append('agent_sessions', state.session_id, 'N1.language_detection', 'agent', {
      detected_language: state.detected_language,
    });
  }

  private async identityCheck(state: AgentState): Promise<void> {
    await this.audit.append('agent_sessions', state.session_id, 'N2.identity_check', 'agent', {
      user_id: state.user.id,
      role: state.user.role,
      department_id: state.user.department_id,
    });
  }

  private async classifyIntent(state: AgentState): Promise<void> {
    const result = await this.nlu.classifyAndExtract(state.raw_input, state.session_id);
    state.intent = result.intent;
    state.entities = result.entities;
    await this.audit.append('agent_sessions', state.session_id, 'N3.intent_classification', 'agent', {
      intent: state.intent,
      entities: state.entities,
    });
  }

  private async guardrailInputScreen(state: AgentState): Promise<void> {
    const flags = this.guardrails.screenUserInput(state.raw_input);
    state.guardrail_flags.push(...flags);
    await this.audit.append('agent_sessions', state.session_id, 'N4.guardrail_input_screen', 'agent', { flags });
  }

  private async retrieve(state: AgentState): Promise<void> {
    state.retrieved_chunks = await this.retrieval.search(`${state.raw_input} ${JSON.stringify(state.entities)}`, 8);
    await this.audit.append('agent_sessions', state.session_id, 'N5.retrieval', 'agent', {
      chunks: state.retrieved_chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        source_document: chunk.source_document,
        document_version: chunk.document_version,
        page: chunk.page,
        clause: chunk.clause,
        similarity: chunk.similarity,
      })),
    });
  }

  private async guardrailDocScreen(state: AgentState): Promise<void> {
    const flags = this.guardrails.screenRetrievedChunks(state.retrieved_chunks);
    state.guardrail_flags.push(...flags);
    await this.audit.append('agent_sessions', state.session_id, 'N6.guardrail_doc_screen', 'agent', { flags });
  }

  private async confidenceGate(state: AgentState): Promise<boolean> {
    const hasGuardrailFailure = state.guardrail_flags.some((flag) => flag.type === 'prompt_injection' && flag.severity === 'high');
    state.retrieval_confidence = this.retrieval.calculateConfidence(state.retrieved_chunks, hasGuardrailFailure);
    const threshold = this.config.get<number>('RETRIEVAL_CONFIDENCE_THRESHOLD') ?? 0.62;
    const sufficient = state.retrieval_confidence >= threshold;
    await this.audit.append('agent_sessions', state.session_id, 'N7.confidence_decision', 'agent', {
      confidence: state.retrieval_confidence,
      threshold,
      sufficient,
    });
    return sufficient;
  }

  private async askForClarification(state: AgentState): Promise<void> {
    const content =
      state.clarification_rounds >= 2
        ? "I'm not certain based on the available institutional documents, so I've looped in staff for help."
        : "I'm not certain yet. Could you share one more detail, such as the exact service, department, date, or purpose?";
    await this.completeMessage(state, content, []);
    await this.audit.append('agent_sessions', state.session_id, 'N7b.ask_user', 'agent', {
      clarification_rounds: state.clarification_rounds + 1,
    });
  }

  private async generatePlan(state: AgentState): Promise<void> {
    state.plan = await this.planner.generatePlan(state);
    const requestType = this.intentToRequestType(state.intent);
    const request = await this.requests.create(state.user.id, {
      request_type: requestType,
      description: state.raw_input,
      department_id: state.user.department_id,
      session_id: state.session_id,
    });

    const persisted = [];
    for (const [index, step] of state.plan.entries()) {
      const sanitizedArgs = this.guardrails.minimizeToolArgs(step.tool_name, step.tool_args);
      if (sanitizedArgs.request_id === 'pending_request_id') {
        sanitizedArgs.request_id = request.id;
      }
      if (step.tool_name === 'create_request') {
        sanitizedArgs.request_id = request.id;
      }
      const created = await this.prisma.workflowStep.create({
        data: {
          requestId: request.id,
          sessionId: state.session_id,
          stepName: step.step_name,
          toolName: step.tool_name,
          toolArgs: sanitizedArgs as Prisma.InputJsonValue,
          rationale: step.rationale,
          riskLevel: (step.risk_level ?? 'medium') as RiskLevel,
          idempotencyKey: createHash('sha256').update(`${state.session_id}:${index}:${step.tool_name}`).digest('hex'),
        },
      });
      step.tool_args = sanitizedArgs;
      persisted.push(created);
    }
    await this.audit.append('agent_sessions', state.session_id, 'N8.generated_plan', 'agent', { steps: state.plan });
    this.emitPlanUpdate(state.session_id, persisted);
  }

  private async policyConflictCheck(state: AgentState): Promise<boolean> {
    const flags = this.guardrails.detectPolicyConflicts(state.retrieved_chunks);
    state.guardrail_flags.push(...flags);
    await this.audit.append('agent_sessions', state.session_id, 'N9.policy_conflict_check', 'agent', { flags });
    return flags.length === 0;
  }

  private async flagAdminQueue(state: AgentState): Promise<void> {
    const conflict = state.guardrail_flags.find((flag) => flag.type === 'policy_conflict');
    const metadata = conflict?.metadata as { chunk_a?: string; chunk_b?: string; document_a?: string; document_b?: string } | undefined;
    const chunkA =
      state.retrieved_chunks.find((chunk) => chunk.chunk_id === metadata?.chunk_a) ??
      state.retrieved_chunks.find((chunk) => chunk.source_document === metadata?.document_a) ??
      state.retrieved_chunks[0];
    const chunkB =
      state.retrieved_chunks.find((chunk) => chunk.chunk_id === metadata?.chunk_b) ??
      state.retrieved_chunks.find((chunk) => chunk.source_document === metadata?.document_b) ??
      state.retrieved_chunks.find((chunk) => chunk.chunk_id !== chunkA?.chunk_id);
    if (chunkA && chunkB) {
      await this.prisma.policyConflictFlag.create({
        data: {
          docAId: chunkA.chunk_id,
          docAClause: chunkA.clause,
          docAVersion: chunkA.document_version,
          docBId: chunkB.chunk_id,
          docBClause: chunkB.clause,
          docBVersion: chunkB.document_version,
        },
      });
    }
    await this.completeMessage(state, "I found conflicting policy information, so I've flagged it for admin review.", []);
  }

  private async riskClassifySteps(state: AgentState): Promise<void> {
    const steps = await this.prisma.workflowStep.findMany({ where: { sessionId: state.session_id }, orderBy: { createdAt: 'asc' } });
    for (const [index, step] of steps.entries()) {
      const classified = await this.risk.classify(state.plan[index] ?? this.dbStepToPlanStep(step), this.intentToRequestType(state.intent));
      await this.prisma.workflowStep.update({
        where: { id: step.id },
        data: { riskLevel: classified.risk_level },
      });
      state.plan[index].risk_level = classified.risk_level;
    }
    const updated = await this.prisma.workflowStep.findMany({ where: { sessionId: state.session_id }, orderBy: { createdAt: 'asc' } });
    await this.audit.append('agent_sessions', state.session_id, 'N10.risk_classification', 'agent', {
      steps: updated.map((step) => ({ id: step.id, tool_name: step.toolName, risk_level: step.riskLevel })),
    });
    this.emitPlanUpdate(state.session_id, updated);
  }

  private async stepLoop(state: AgentState): Promise<void> {
    const steps = await this.prisma.workflowStep.findMany({ where: { sessionId: state.session_id }, orderBy: { createdAt: 'asc' } });
    for (const step of steps) {
      if (['done', 'failed', 'rejected'].includes(step.status)) {
        continue;
      }
      state.current_step_index += 1;
      if (step.riskLevel === 'low') {
        const flags = this.guardrails.screenToolArgs(this.dbStepToPlanStep(step));
        state.guardrail_flags.push(...flags);
        await this.tools.execute(
          step.toolName,
          step.toolArgs as Record<string, unknown>,
          {
            user: state.user,
            session_id: state.session_id,
            workflow_step_id: step.id,
            idempotency_key: step.idempotencyKey,
          },
          'low',
        );
        continue;
      }

      const approval = await this.approvals.createForStep(step.id, {
        original_request: state.raw_input,
        retrieved_evidence: state.retrieved_chunks,
        reasoning_trace: step.rationale,
        proposed_tool: { tool_name: step.toolName, args: step.toolArgs },
        risk_level: step.riskLevel,
        guardrail_flags: state.guardrail_flags,
      });
      state.pending_approval_id = approval.id;
      await this.audit.append('agent_sessions', state.session_id, 'N14.approval_wait', 'agent', {
        approval_id: approval.id,
        workflow_step_id: step.id,
      });
      const refreshed = await this.prisma.workflowStep.findMany({ where: { sessionId: state.session_id }, orderBy: { createdAt: 'asc' } });
      this.emitPlanUpdate(state.session_id, refreshed);
      await this.completeMessage(state, 'I created an approval request for the high-risk step and paused until staff reviews it.', []);
      return;
    }
  }

  private async notifyUser(state: AgentState): Promise<void> {
    const citedChunkIds = state.retrieved_chunks.slice(0, 3).map((chunk) => chunk.chunk_id);
    const citationFlags = this.guardrails.validateCitations(citedChunkIds, state.retrieved_chunks);
    if (citationFlags.length > 0) {
      await this.completeMessage(state, "I'm not certain - let me check with staff.", []);
      return;
    }
    const content = `Done. I completed the low-risk steps for your ${state.intent.replace('_', ' ')} request.`;
    await this.completeMessage(state, content, citedChunkIds);
    await this.audit.append('agent_sessions', state.session_id, 'N16.final_notification', 'agent', {
      citations: citedChunkIds,
    });
  }

  private async finalAudit(state: AgentState): Promise<void> {
    await this.audit.append('agent_sessions', state.session_id, 'N17.audit_log_final', 'agent', {
      final_response: state.final_response,
      retrieval_confidence: state.retrieval_confidence,
      guardrail_flags: state.guardrail_flags,
    });
  }

  private async completeMessage(state: AgentState, content: string, citedChunkIds: string[]): Promise<void> {
    state.final_response = content;
    for (const token of content.split(/(\s+)/).filter(Boolean)) {
      this.events.emitToSession(state.session_id, 'message.token', { session_id: state.session_id, token });
    }
    const message = await this.prisma.agentMessage.create({
      data: {
        sessionId: state.session_id,
        sender: 'agent',
        content,
        confidenceScore: state.retrieval_confidence,
        citedChunkIds,
      },
    });
    this.events.emitToSession(state.session_id, 'message.complete', {
      session_id: state.session_id,
      message,
    });
  }

  private emitPlanUpdate(sessionId: string, steps: Array<{ stepName: string; toolName: string; riskLevel: RiskLevel; status: string; rationale: string }>): void {
    this.events.emitToSession(sessionId, 'plan.update', {
      session_id: sessionId,
      steps: steps.map((step) => ({
        step_name: step.stepName,
        tool_name: step.toolName,
        risk_level: step.riskLevel,
        status: step.status,
        rationale: step.rationale,
      })),
    });
  }

  private dbStepToPlanStep(step: { stepName: string; toolName: string; toolArgs: unknown; rationale: string; riskLevel?: RiskLevel }): PlanStep {
    return {
      step_name: step.stepName,
      tool_name: step.toolName,
      tool_args: step.toolArgs as Record<string, unknown>,
      rationale: step.rationale,
      risk_level: step.riskLevel,
    };
  }

  private intentToRequestType(intent: Intent): string {
    const map: Record<Intent, string> = {
      certificate_request: 'certificate',
      maintenance_issue: 'maintenance',
      lab_booking: 'lab_booking',
      grievance: 'grievance',
      general_query: 'general_query',
      small_talk: 'general_query',
    };
    return map[intent];
  }

  private async handleFailure(sessionId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'unknown';
    this.logger.error({ session_id: sessionId, node: 'graph_failure', status: 'failed', error: message });
    await this.audit.append('agent_sessions', sessionId, 'graph.failure', 'agent', { error: message });
    this.events.emitToSession(sessionId, 'message.complete', {
      session_id: sessionId,
      message: {
        sender: 'agent',
        content: 'Something went wrong while processing the request. Staff can review the audit trail for details.',
        cited_chunk_ids: [],
        confidence_score: null,
        created_at: new Date(),
      },
    });
  }
}
