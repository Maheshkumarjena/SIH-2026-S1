import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { Annotation, END, START, StateGraph, CompiledStateGraph } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
import { ApprovalsService } from '../approvals/approvals.service';
import { HashChainService } from '../audit/hash-chain.service';
import {
  AgentMessage,
  AgentState,
  AuthenticatedUser,
  ChunkResult,
  GuardrailFlag,
  Intent,
  PlanStep,
  RiskLevel,
  SupportedLanguage,
} from '../common/types';
import { RetrievalService } from '../knowledge-base/retrieval.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';
import { RequestsService } from '../requests/requests.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { GuardrailService } from './guardrails/guardrail.service';
import { NluService } from './nlu.service';
import { PlannerService } from './planner.service';
import { RiskClassificationService } from './risk/risk-classification.service';

export const AgentStateAnnotation = Annotation.Root({
  session_id: Annotation<string>(),
  user: Annotation<AuthenticatedUser>(),
  raw_input: Annotation<string>(),
  detected_language: Annotation<SupportedLanguage>(),
  intent: Annotation<Intent>(),
  entities: Annotation<Record<string, unknown>>(),
  retrieved_chunks: Annotation<ChunkResult[]>(),
  retrieval_confidence: Annotation<number>(),
  plan: Annotation<PlanStep[]>(),
  current_step_index: Annotation<number>(),
  guardrail_flags: Annotation<GuardrailFlag[]>({
    reducer: (curr, update) => (update ? curr.concat(update) : curr),
    default: () => [],
  }),
  pending_approval_id: Annotation<string | null>(),
  clarification_rounds: Annotation<number>(),
  retry_counts: Annotation<Record<string, number>>(),
  conversation_history: Annotation<AgentMessage[]>(),
  tool_results: Annotation<Array<{ tool_name: string; result: unknown }>>({
    reducer: (curr, update) => (update ? curr.concat(update) : curr),
    default: () => [],
  }),
  final_response: Annotation<string | null>(),
  error: Annotation<string | null>(),
});

export type AgentGraphState = typeof AgentStateAnnotation.State;

@Injectable()
export class AgentOrchestrationService implements OnModuleInit {
  private readonly logger = new Logger(AgentOrchestrationService.name);
  private compiledGraph!: CompiledStateGraph<any, any, any>;

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

  onModuleInit(): void {
    this.setupLangSmith();
    this.buildGraph();
  }

  private setupLangSmith(): void {
    const langsmithApiKey = this.config.get<string>('LANGSMITH_API_KEY') ?? process.env.LANGSMITH_API_KEY;
    const langsmithTracing = this.config.get<string>('LANGSMITH_TRACING') ?? process.env.LANGSMITH_TRACING;
    const langsmithEndpoint = this.config.get<string>('LANGSMITH_ENDPOINT') ?? process.env.LANGSMITH_ENDPOINT;
    const langsmithProject =
      this.config.get<string>('LANGSMITH_PROJECT') ??
      process.env.LANGSMITH_PROJECT ??
      'campus-service-copilot';

    const hasValidKey = Boolean(langsmithApiKey && langsmithApiKey.trim().length > 0 && !langsmithApiKey.startsWith('replace'));
    const isTracingEnabled = langsmithTracing === 'true' || langsmithTracing === '1';

    if (hasValidKey && isTracingEnabled) {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = langsmithApiKey;
      process.env.LANGCHAIN_PROJECT = langsmithProject;
      if (langsmithEndpoint) {
        process.env.LANGCHAIN_ENDPOINT = langsmithEndpoint;
      }
      this.logger.log(`🔭 LangSmith tracing initialized for project: '${langsmithProject}'`);
    } else {
      delete process.env.LANGCHAIN_TRACING_V2;
      delete process.env.LANGSMITH_TRACING;
      this.logger.log(`ℹ️ LangSmith API key not provided. Running LangGraph in local mode.`);
    }
  }

  private buildGraph(): void {
    const workflow = new StateGraph(AgentStateAnnotation)
      .addNode('detect_language', async (state) => this.detectLanguageNode(state))
      .addNode('identity_check', async (state) => this.identityCheckNode(state))
      .addNode('classify_intent', async (state) => this.classifyIntentNode(state))
      .addNode('guardrail_input_screen', async (state) => this.guardrailInputScreenNode(state))
      .addNode('retrieve', async (state) => this.retrieveNode(state))
      .addNode('guardrail_doc_screen', async (state) => this.guardrailDocScreenNode(state))
      .addNode('confidence_evaluator', async (state) => this.confidenceEvaluatorNode(state))
      .addNode('ask_for_clarification', async (state) => this.askForClarificationNode(state))
      .addNode('generate_plan', async (state) => this.generatePlanNode(state))
      .addNode('policy_conflict_screen', async (state) => this.policyConflictScreenNode(state))
      .addNode('flag_admin_queue', async (state) => this.flagAdminQueueNode(state))
      .addNode('risk_classify_steps', async (state) => this.riskClassifyStepsNode(state))
      .addNode('step_loop', async (state) => this.stepLoopNode(state))
      .addNode('notify_user', async (state) => this.notifyUserNode(state))
      .addNode('final_audit', async (state) => this.finalAuditNode(state))

      .addEdge(START, 'detect_language')
      .addEdge('detect_language', 'identity_check')
      .addEdge('identity_check', 'classify_intent')
      .addEdge('classify_intent', 'guardrail_input_screen')
      .addEdge('guardrail_input_screen', 'retrieve')
      .addEdge('retrieve', 'guardrail_doc_screen')
      .addEdge('guardrail_doc_screen', 'confidence_evaluator')
      .addConditionalEdges('confidence_evaluator', (state) => {
        const toolDrivenIntents: Intent[] = [
          'fee_query',
          'exam_record_query',
          'student_profile_query',
          'certificate_request',
          'lab_booking',
          'maintenance_issue',
          'grievance',
        ];
        const isToolDriven = toolDrivenIntents.includes(state.intent);
        const threshold = this.config.get<number>('RETRIEVAL_CONFIDENCE_THRESHOLD') ?? 0.62;
        return isToolDriven || state.retrieval_confidence >= threshold ? 'confident' : 'needs_clarification';
      }, {
        confident: 'generate_plan',
        needs_clarification: 'ask_for_clarification',
      })
      .addEdge('ask_for_clarification', END)
      .addEdge('generate_plan', 'policy_conflict_screen')
      .addConditionalEdges('policy_conflict_screen', (state) => {
        const hasConflict = state.guardrail_flags.some((flag) => flag.type === 'policy_conflict');
        return hasConflict ? 'has_conflict' : 'no_conflict';
      }, {
        has_conflict: 'flag_admin_queue',
        no_conflict: 'risk_classify_steps',
      })
      .addEdge('flag_admin_queue', END)
      .addEdge('risk_classify_steps', 'step_loop')
      .addConditionalEdges('step_loop', (state) => {
        if (state.pending_approval_id) {
          return 'awaiting_approval';
        }
        return 'continue_notification';
      }, {
        awaiting_approval: END,
        continue_notification: 'notify_user',
      })
      .addEdge('notify_user', 'final_audit')
      .addEdge('final_audit', END);

    this.compiledGraph = workflow.compile();
    this.logger.log('🧠 LangGraph state graph compiled successfully with 15 nodes and conditional routing.');
  }

  async runGraph(sessionId: string, user: AuthenticatedUser, rawInput: string): Promise<void> {
    const started = Date.now();
    this.logger.log(`🚀 [LangGraph] Starting graph execution for session: ${sessionId} | User: ${user.id} (${user.role})`);
    
    try {
      const initialState = await this.initializeState(sessionId, user, rawInput);
      
      const config: RunnableConfig = {
        runName: `CampusCopilot_Session_${sessionId}`,
        tags: [user.role, user.preferred_language, 'langgraph', 'campus-copilot'],
        metadata: {
          sessionId,
          userId: user.id,
          userRole: user.role,
          departmentId: user.department_id,
          preferredLanguage: user.preferred_language,
        },
      };

      if (!this.compiledGraph) {
        this.buildGraph();
      }

      await this.compiledGraph.invoke(initialState, config);
      this.logger.log(`✅ [LangGraph] Graph execution completed for session: ${sessionId} (+${Date.now() - started}ms)`);
    } catch (error) {
      await this.handleFailure(sessionId, error);
    }
  }

  private async initializeState(sessionId: string, user: AuthenticatedUser, rawInput: string): Promise<AgentGraphState> {
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
      tool_results: [],
      final_response: null,
      error: null,
    };
  }

  // --- LangGraph Node Implementations ---

  private async detectLanguageNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: detect_language] 🌐 Detecting language for input: "${state.raw_input.slice(0, 50)}"`);
    this.emitProgress(state.session_id, 'detect_language', 'Detecting input language & user preferences...', 0, 10);
    const detected_language = await this.nlu.detectLanguage(state.raw_input, state.session_id);
    await this.audit.append('agent_sessions', state.session_id, 'N1.language_detection', 'agent', {
      detected_language,
    });
    console.log(`[LangGraph Node: detect_language] ✅ Detected language: ${detected_language}`);
    return { detected_language };
  }

  private async identityCheckNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: identity_check] 🛡️ Verifying user identity: ${state.user.id} (${state.user.role})`);
    this.emitProgress(state.session_id, 'identity_check', `Verifying identity & role permissions (${state.user.role})...`, 1, 10);
    await this.audit.append('agent_sessions', state.session_id, 'N2.identity_check', 'agent', {
      user_id: state.user.id,
      role: state.user.role,
      department_id: state.user.department_id,
    });
    return {};
  }

  private async classifyIntentNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: classify_intent] 🎯 Classifying intent & extracting entities`);
    this.emitProgress(state.session_id, 'classify_intent', 'Classifying request intent & extracting key parameters...', 2, 10);
    const result = await this.nlu.classifyAndExtract(state.raw_input, state.session_id);
    await this.audit.append('agent_sessions', state.session_id, 'N3.intent_classification', 'agent', {
      intent: result.intent,
      entities: result.entities,
    });
    console.log(`[LangGraph Node: classify_intent] ✅ Intent classified: '${result.intent}'`);
    this.emitProgress(state.session_id, 'classify_intent', `Intent identified: ${result.intent.replace(/_/g, ' ')}`, 2, 10, { intent: result.intent });
    return {
      intent: result.intent,
      entities: result.entities,
    };
  }

  private async guardrailInputScreenNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: guardrail_input_screen] 🔍 Screening user input against guardrails`);
    this.emitProgress(state.session_id, 'guardrail_input_screen', 'Screening input prompt against safety & security guardrails...', 3, 10);
    const flags = this.guardrails.screenUserInput(state.raw_input);
    await this.audit.append('agent_sessions', state.session_id, 'N4.guardrail_input_screen', 'agent', { flags });
    return {
      guardrail_flags: flags,
    };
  }

  private async retrieveNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: retrieve] 📚 Running Hybrid Retrieval (pgvector + tsvector) & Groq Reranker (top-12 -> top-6)`);
    this.emitProgress(state.session_id, 'retrieve', 'Searching campus knowledge base & policy records...', 4, 10);
    const query = `${state.raw_input} ${JSON.stringify(state.entities)}`;
    const retrieved_chunks = await this.retrieval.search(query, 6, state.session_id);
    await this.audit.append('agent_sessions', state.session_id, 'N5.hybrid_retrieval_and_rerank', 'agent', {
      query,
      top_k: 6,
      chunks: retrieved_chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        source_document: chunk.source_document,
        document_version: chunk.document_version,
        page: chunk.page,
        clause: chunk.clause,
        similarity: chunk.similarity,
      })),
    });
    console.log(`[LangGraph Node: retrieve] ✅ Selected ${retrieved_chunks.length} reranked chunks`);
    this.emitProgress(state.session_id, 'retrieve', `Retrieved ${retrieved_chunks.length} institutional policy documents`, 4, 10, { count: retrieved_chunks.length });
    return { retrieved_chunks };
  }

  private async guardrailDocScreenNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: guardrail_doc_screen] 🔍 Screening retrieved document chunks`);
    this.emitProgress(state.session_id, 'guardrail_doc_screen', 'Validating retrieved documents for clearance & confidentiality...', 5, 10);
    const flags = this.guardrails.screenRetrievedChunks(state.retrieved_chunks);
    await this.audit.append('agent_sessions', state.session_id, 'N6.guardrail_doc_screen', 'agent', { flags });
    return {
      guardrail_flags: flags,
    };
  }

  private async confidenceEvaluatorNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    const hasGuardrailFailure = state.guardrail_flags.some(
      (flag) => flag.type === 'prompt_injection' && flag.severity === 'high',
    );
    const retrieval_confidence = this.retrieval.calculateConfidence(
      state.retrieved_chunks,
      hasGuardrailFailure,
    );
    const threshold = this.config.get<number>('RETRIEVAL_CONFIDENCE_THRESHOLD') ?? 0.62;
    const sufficient = retrieval_confidence >= threshold;

    console.log(`[LangGraph Node: confidence_evaluator] 📊 Confidence score: ${retrieval_confidence.toFixed(2)} (Threshold: ${threshold}) -> ${sufficient ? 'PASS' : 'FAIL'}`);
    this.emitProgress(
      state.session_id,
      'confidence_evaluator',
      `Document evidence confidence: ${Math.round(retrieval_confidence * 100)}% (${sufficient ? 'Sufficient' : 'Below threshold'})`,
      6,
      10,
      { confidence: retrieval_confidence, threshold, sufficient },
    );

    await this.audit.append('agent_sessions', state.session_id, 'N7.confidence_decision', 'agent', {
      confidence: retrieval_confidence,
      threshold,
      sufficient,
    });

    return { retrieval_confidence };
  }

  private async askForClarificationNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: ask_for_clarification] ❓ Asking user for clarification (round: ${state.clarification_rounds + 1})`);
    const content =
      state.clarification_rounds >= 2
        ? "I'm not certain based on the available institutional documents, so I've looped in staff for help."
        : "I'm not certain yet. Could you share one more detail, such as the exact service, department, date, or purpose?";
    await this.completeMessage(state, content, []);
    await this.audit.append('agent_sessions', state.session_id, 'N7b.ask_user', 'agent', {
      clarification_rounds: state.clarification_rounds + 1,
    });
    return {
      final_response: content,
      clarification_rounds: state.clarification_rounds + 1,
    };
  }

  private async generatePlanNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: generate_plan] 📋 Generating execution plan and persisting request`);
    this.emitProgress(state.session_id, 'generate_plan', 'Formulating multi-step tool execution plan...', 7, 10);
    const plan = await this.planner.generatePlan(state as AgentState);
    const requestType = this.intentToRequestType(state.intent);
    const request = await this.requests.create(state.user.id, {
      request_type: requestType,
      description: state.raw_input,
      department_id: state.user.department_id,
      session_id: state.session_id,
    });

    const persisted = [];
    const updatedPlan = [...plan];
    for (const [index, step] of updatedPlan.entries()) {
      const sanitizedArgs = this.guardrails.minimizeToolArgs(step.tool_name, step.tool_args);
      if (sanitizedArgs.request_id === 'pending_request_id' || step.tool_name === 'create_request') {
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
          idempotencyKey: createHash('sha256')
            .update(`${state.session_id}:${index}:${step.tool_name}`)
            .digest('hex'),
        },
      });
      step.tool_args = sanitizedArgs;
      persisted.push(created);
    }

    await this.audit.append('agent_sessions', state.session_id, 'N8.generated_plan', 'agent', {
      steps: updatedPlan,
    });
    this.emitPlanUpdate(state.session_id, persisted);
    this.emitProgress(state.session_id, 'generate_plan', `Plan formulated with ${updatedPlan.length} step(s)`, 7, 10, { steps_count: updatedPlan.length });
    console.log(`[LangGraph Node: generate_plan] ✅ Plan generated with ${updatedPlan.length} steps`);
    return { plan: updatedPlan };
  }

  private async policyConflictScreenNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: policy_conflict_screen] ⚖️ Checking for institutional policy conflicts`);
    const flags = this.guardrails.detectPolicyConflicts(state.retrieved_chunks);
    await this.audit.append('agent_sessions', state.session_id, 'N9.policy_conflict_check', 'agent', { flags });
    return {
      guardrail_flags: flags,
    };
  }

  private async flagAdminQueueNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: flag_admin_queue] 🚩 Policy conflict detected - escalating to admin queue`);
    const conflict = state.guardrail_flags.find((flag) => flag.type === 'policy_conflict');
    const metadata = conflict?.metadata as
      | { chunk_a?: string; chunk_b?: string; document_a?: string; document_b?: string }
      | undefined;
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

    const responseText = "I found conflicting policy information, so I've flagged it for admin review.";
    await this.completeMessage(state, responseText, []);
    return {
      final_response: responseText,
    };
  }

  private async riskClassifyStepsNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: risk_classify_steps] 🚦 Classifying risk levels for workflow steps`);
    const steps = await this.prisma.workflowStep.findMany({
      where: { sessionId: state.session_id },
      orderBy: { createdAt: 'asc' },
    });

    const updatedPlan = [...state.plan];
    for (const [index, step] of steps.entries()) {
      const classified = await this.risk.classify(
        updatedPlan[index] ?? this.dbStepToPlanStep(step),
        this.intentToRequestType(state.intent),
      );
      await this.prisma.workflowStep.update({
        where: { id: step.id },
        data: { riskLevel: classified.risk_level },
      });
      if (updatedPlan[index]) {
        updatedPlan[index].risk_level = classified.risk_level;
      }
    }

    const updated = await this.prisma.workflowStep.findMany({
      where: { sessionId: state.session_id },
      orderBy: { createdAt: 'asc' },
    });

    await this.audit.append('agent_sessions', state.session_id, 'N10.risk_classification', 'agent', {
      steps: updated.map((step) => ({ id: step.id, tool_name: step.toolName, risk_level: step.riskLevel })),
    });

    this.emitPlanUpdate(state.session_id, updated);
    console.log(`[LangGraph Node: risk_classify_steps] ✅ Risk classified for ${updated.length} steps`);
    return { plan: updatedPlan };
  }

  private async stepLoopNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: step_loop] ⚙️ Executing workflow steps`);
    this.emitProgress(state.session_id, 'step_loop', 'Starting tool execution steps...', 8, 10);
    const steps = await this.prisma.workflowStep.findMany({
      where: { sessionId: state.session_id },
      orderBy: { createdAt: 'asc' },
    });

    let currentStepIndex = state.current_step_index;
    const additionalFlags: GuardrailFlag[] = [];
    const executedToolResults: Array<{ tool_name: string; result: unknown }> = [...(state.tool_results ?? [])];

    for (const [idx, step] of steps.entries()) {
      if (['done', 'failed', 'rejected'].includes(step.status)) {
        if (step.status === 'done' && step.resultJson) {
          if (!executedToolResults.some((tr) => tr.tool_name === step.toolName)) {
            executedToolResults.push({ tool_name: step.toolName, result: step.resultJson });
          }
        }
        continue;
      }

      currentStepIndex += 1;

      if (step.riskLevel === 'low') {
        console.log(`[LangGraph Node: step_loop] 🟢 Executing low-risk tool: ${step.toolName}`);
        this.emitProgress(
          state.session_id,
          'step_loop',
          `Executing step ${idx + 1}/${steps.length}: ${step.stepName}`,
          8 + idx,
          8 + steps.length,
          { tool_name: step.toolName, step_name: step.stepName, risk_level: step.riskLevel },
        );
        const flags = this.guardrails.screenToolArgs(this.dbStepToPlanStep(step));
        additionalFlags.push(...flags);
        const result = await this.tools.execute(
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
        executedToolResults.push({ tool_name: step.toolName, result });

        this.emitProgress(
          state.session_id,
          'step_loop',
          `Completed step ${idx + 1}/${steps.length}: ${step.stepName}`,
          8 + idx + 1,
          8 + steps.length,
          { tool_name: step.toolName, step_name: step.stepName, status: 'done' },
        );
        continue;
      }

      // Medium / High risk: requires approval
      console.log(`[LangGraph Node: step_loop] 🟡 High/Medium risk step encountered (${step.toolName}) -> Pausing for staff approval`);
      this.emitProgress(
        state.session_id,
        'step_loop',
        `Step ${idx + 1}/${steps.length} (${step.stepName}) requires staff approval - pausing execution`,
        8 + idx,
        8 + steps.length,
        { tool_name: step.toolName, step_name: step.stepName, risk_level: step.riskLevel, awaiting_approval: true },
      );
      const approval = await this.approvals.createForStep(step.id, {
        original_request: state.raw_input,
        retrieved_evidence: state.retrieved_chunks,
        reasoning_trace: step.rationale,
        proposed_tool: { tool_name: step.toolName, args: step.toolArgs },
        risk_level: step.riskLevel,
        guardrail_flags: state.guardrail_flags.concat(additionalFlags),
      });

      await this.audit.append('agent_sessions', state.session_id, 'N14.approval_wait', 'agent', {
        approval_id: approval.id,
        workflow_step_id: step.id,
      });

      const refreshed = await this.prisma.workflowStep.findMany({
        where: { sessionId: state.session_id },
        orderBy: { createdAt: 'asc' },
      });
      this.emitPlanUpdate(state.session_id, refreshed);
      await this.completeMessage(
        state,
        'I created an approval request for the high-risk step and paused until staff reviews it.',
        [],
      );

      return {
        pending_approval_id: approval.id,
        current_step_index: currentStepIndex,
        guardrail_flags: additionalFlags,
        tool_results: executedToolResults,
      };
    }

    return {
      current_step_index: currentStepIndex,
      guardrail_flags: additionalFlags,
      tool_results: executedToolResults,
    };
  }

  private async notifyUserNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: notify_user] 💬 Generating final user response`);
    this.emitProgress(state.session_id, 'notify_user', 'Synthesizing response from database & policy context...', 9, 10);
    const citedChunkIds = state.retrieved_chunks.slice(0, 3).map((chunk) => chunk.chunk_id);
    
    let content: string;
    try {
      content = await this.nlu.generateSynthesizedResponse(
        state.raw_input,
        state.intent,
        state.user,
        state.tool_results ?? [],
        state.retrieved_chunks,
        state.session_id,
      );
    } catch (err) {
      this.logger.warn(`Failed to synthesize response with LLM: ${err}`);
      content = `Done. I processed your request for ${state.intent.replace(/_/g, ' ')}.`;
    }

    const hasToolResults = (state.tool_results ?? []).length > 0;
    const citationFlags = this.guardrails.validateCitationSupport(
      content,
      citedChunkIds,
      state.retrieved_chunks,
      hasToolResults,
    );

    if (citationFlags.length > 0) {
      console.log(`[LangGraph Node: notify_user] ⚠️ Citation support validation failed - asking staff`);
      await this.completeMessage(state, "I'm not certain - let me check with staff.", []);
      return {
        final_response: "I'm not certain - let me check with staff.",
        guardrail_flags: citationFlags,
      };
    }

    await this.completeMessage(state, content, citedChunkIds);
    await this.audit.append('agent_sessions', state.session_id, 'N16.final_notification', 'agent', {
      citations: citedChunkIds,
    });

    console.log(`[LangGraph Node: notify_user] ✅ Final response sent to user`);
    return {
      final_response: content,
    };
  }

  private async finalAuditNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    console.log(`[LangGraph Node: final_audit] 🔒 Appending final cryptographic audit log`);
    await this.audit.append('agent_sessions', state.session_id, 'N17.audit_log_final', 'agent', {
      final_response: state.final_response,
      retrieval_confidence: state.retrieval_confidence,
      guardrail_flags: state.guardrail_flags,
    });
    return {};
  }

  // --- Helper Methods ---

  private async completeMessage(
    state: AgentGraphState,
    content: string,
    citedChunkIds: string[],
  ): Promise<void> {
    console.log(`\n----------------------------------------------------------------------------------------------------`);
    console.log(`🤖 [AGENT RESPONSE] (Session: ${state.session_id})`);
    console.log(`----------------------------------------------------------------------------------------------------`);
    console.log(content);
    console.log(`----------------------------------------------------------------------------------------------------\n`);

    for (const token of content.split(/(\s+)/).filter(Boolean)) {
      this.events.emitToSession(state.session_id, 'message.token', {
        session_id: state.session_id,
        token,
      });
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

  private emitPlanUpdate(
    sessionId: string,
    steps: Array<{ stepName: string; toolName: string; riskLevel: RiskLevel; status: string; rationale: string }>,
  ): void {
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

  private emitProgress(
    sessionId: string,
    stage: string,
    message: string,
    stepIndex: number = 0,
    totalSteps: number = 10,
    details?: Record<string, unknown>,
  ): void {
    this.events.emitToSession(sessionId, 'agent.progress', {
      session_id: sessionId,
      stage,
      message,
      step_index: stepIndex,
      total_steps: totalSteps,
      progress_percent: Math.min(100, Math.round(((stepIndex + 1) / totalSteps) * 100)),
      timestamp: new Date().toISOString(),
      ...(details ?? {}),
    });
  }

  private dbStepToPlanStep(step: {
    stepName: string;
    toolName: string;
    toolArgs: unknown;
    rationale: string;
    riskLevel?: RiskLevel;
  }): PlanStep {
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
      fee_query: 'general_query',
      exam_record_query: 'general_query',
      student_profile_query: 'general_query',
    };
    return map[intent] ?? 'general_query';
  }

  private async handleFailure(sessionId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'unknown';
    this.logger.error(`💥 [LangGraph Failure] Session: ${sessionId} | Error: ${message}`, (error as Error)?.stack);
    await this.audit.append('agent_sessions', sessionId, 'graph.failure', 'agent', { error: message });

    const failureResponse =
      'Something went wrong while processing the request. Staff can review the audit trail for details.';

    console.log(`\n----------------------------------------------------------------------------------------------------`);
    console.log(`🤖 [AGENT RESPONSE] (Session: ${sessionId} | ERROR FALLBACK)`);
    console.log(`----------------------------------------------------------------------------------------------------`);
    console.log(failureResponse);
    console.log(`----------------------------------------------------------------------------------------------------\n`);

    this.events.emitToSession(sessionId, 'message.complete', {
      session_id: sessionId,
      message: {
        sender: 'agent',
        content: failureResponse,
        cited_chunk_ids: [],
        confidence_score: null,
        created_at: new Date(),
      },
    });
  }
}
