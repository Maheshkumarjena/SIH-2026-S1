import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentOrchestrationService } from '../src/agent/agent-orchestration.service';
import { NluService } from '../src/agent/nlu.service';
import { PlannerService } from '../src/agent/planner.service';
import { GuardrailService } from '../src/agent/guardrails/guardrail.service';
import { RiskClassificationService } from '../src/agent/risk/risk-classification.service';
import { RetrievalService } from '../src/knowledge-base/retrieval.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { HashChainService } from '../src/audit/hash-chain.service';
import { EventDispatcherService } from '../src/realtime/event-dispatcher.service';
import { RequestsService } from '../src/requests/requests.service';
import { ToolExecutionService } from '../src/tools/tool-execution.service';
import { AuthenticatedUser } from '../src/common/types';

describe('AgentOrchestrationService (LangGraph)', () => {
  let service: AgentOrchestrationService;

  const mockUser: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'student',
    department_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    preferred_language: 'en',
  };

  const mockPrisma = {
    agentMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'msg_1', content: 'Done.' }),
    },
    workflowStep: {
      create: jest.fn().mockResolvedValue({ id: 'step_1', status: 'pending' }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'step_1',
          stepName: 'Verify eligibility',
          toolName: 'verify_student_eligibility',
          toolArgs: {},
          rationale: 'Verify student',
          riskLevel: 'low',
          status: 'pending',
          idempotencyKey: 'idem_1',
        },
      ]),
      update: jest.fn().mockResolvedValue({ id: 'step_1', riskLevel: 'low' }),
    },
    policyConflictFlag: {
      create: jest.fn().mockResolvedValue({ id: 'flag_1' }),
    },
  };

  const mockNlu = {
    detectLanguage: jest.fn().mockResolvedValue('en'),
    classifyAndExtract: jest.fn().mockResolvedValue({
      intent: 'certificate_request',
      entities: { certificate_type: 'bonafide' },
    }),
  };

  const mockRetrieval = {
    search: jest.fn().mockResolvedValue([
      {
        chunk_id: 'chunk_1',
        content: 'Bonafide certificate issued within 48h.',
        source_document: 'policy.md',
        document_version: 'v1',
        page: 1,
        clause: '1.1',
        similarity: 0.92,
      },
    ]),
    calculateConfidence: jest.fn().mockReturnValue(0.85),
  };

  const mockGuardrails = {
    screenUserInput: jest.fn().mockReturnValue([]),
    screenRetrievedChunks: jest.fn().mockReturnValue([]),
    detectPolicyConflicts: jest.fn().mockReturnValue([]),
    minimizeToolArgs: jest.fn().mockImplementation((name, args) => args),
    screenToolArgs: jest.fn().mockReturnValue([]),
    validateCitationSupport: jest.fn().mockReturnValue([]),
  };

  const mockPlanner = {
    generatePlan: jest.fn().mockResolvedValue([
      {
        step_name: 'Verify eligibility',
        tool_name: 'verify_student_eligibility',
        tool_args: {},
        rationale: 'Verify student status',
        risk_level: 'low',
      },
    ]),
  };

  const mockRisk = {
    classify: jest.fn().mockResolvedValue({ risk_level: 'low' }),
  };

  const mockTools = {
    execute: jest.fn().mockResolvedValue({ verified: true }),
  };

  const mockApprovals = {
    createForStep: jest.fn().mockResolvedValue({ id: 'appr_1' }),
  };

  const mockAudit = {
    append: jest.fn().mockResolvedValue({ hash: 'hash_123' }),
  };

  const mockEvents = {
    emitToSession: jest.fn(),
  };

  const mockRequests = {
    create: jest.fn().mockResolvedValue({ id: 'req_123' }),
  };

  const mockConfig = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'RETRIEVAL_CONFIDENCE_THRESHOLD') return 0.62;
      return null;
    }),
  };

  beforeEach(async () => {
    delete process.env.LANGCHAIN_TRACING_V2;
    delete process.env.LANGSMITH_TRACING;
    delete process.env.LANGCHAIN_API_KEY;
    delete process.env.LANGSMITH_API_KEY;
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentOrchestrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NluService, useValue: mockNlu },
        { provide: RetrievalService, useValue: mockRetrieval },
        { provide: GuardrailService, useValue: mockGuardrails },
        { provide: PlannerService, useValue: mockPlanner },
        { provide: RiskClassificationService, useValue: mockRisk },
        { provide: ToolExecutionService, useValue: mockTools },
        { provide: ApprovalsService, useValue: mockApprovals },
        { provide: HashChainService, useValue: mockAudit },
        { provide: EventDispatcherService, useValue: mockEvents },
        { provide: RequestsService, useValue: mockRequests },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = moduleRef.get<AgentOrchestrationService>(AgentOrchestrationService);
    service.onModuleInit();
  });

  it('successfully compiles and executes full LangGraph workflow for low-risk request', async () => {
    await service.runGraph('sess_123', mockUser, 'I need a bonafide certificate for my visa application');

    expect(mockNlu.detectLanguage).toHaveBeenCalled();
    expect(mockNlu.classifyAndExtract).toHaveBeenCalled();
    expect(mockRetrieval.search).toHaveBeenCalled();
    expect(mockPlanner.generatePlan).toHaveBeenCalled();
    expect(mockRequests.create).toHaveBeenCalled();
    expect(mockTools.execute).toHaveBeenCalledWith(
      'verify_student_eligibility',
      expect.any(Object),
      expect.objectContaining({ session_id: 'sess_123' }),
      'low',
    );
    expect(mockPrisma.agentMessage.create).toHaveBeenCalled();
    expect(mockAudit.append).toHaveBeenCalledWith(
      'agent_sessions',
      'sess_123',
      'N17.audit_log_final',
      'agent',
      expect.any(Object),
    );
  });

  it('routes to ask_for_clarification when confidence is low', async () => {
    mockRetrieval.calculateConfidence.mockReturnValueOnce(0.3);

    await service.runGraph('sess_456', mockUser, 'random gibberish text');

    expect(mockNlu.detectLanguage).toHaveBeenCalled();
    expect(mockPlanner.generatePlan).not.toHaveBeenCalled();
    expect(mockRequests.create).not.toHaveBeenCalled();
    expect(mockPrisma.agentMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'sess_456',
          content: expect.stringContaining("I'm not certain"),
        }),
      }),
    );
  });
});
