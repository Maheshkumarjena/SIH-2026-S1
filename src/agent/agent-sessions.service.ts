import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AgentOrchestrationService } from './agent-orchestration.service';
import { PostAgentMessageDto, StartAgentSessionDto } from './dto';

@Injectable()
export class AgentSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestration: AgentOrchestrationService,
  ) {}

  async start(user: AuthenticatedUser, dto: StartAgentSessionDto) {
    const session = await this.prisma.agentSession.create({
      data: {
        userId: user.id,
        language: dto.language ?? user.preferred_language,
      },
    });
    return { session_id: session.id, started_at: session.startedAt };
  }

  async postMessage(id: string, user: AuthenticatedUser, dto: PostAgentMessageDto) {
    const session = await this.assertOwnedSession(id, user.id);
    await this.prisma.agentMessage.create({
      data: {
        sessionId: session.id,
        sender: 'user',
        content: dto.content,
        citedChunkIds: [],
      },
    });
    void this.orchestration.runGraph(session.id, user, dto.content);
    return { accepted: true };
  }

  async getHistory(id: string, user: AuthenticatedUser) {
    const session = await this.assertOwnedSession(id, user.id);
    const messages = await this.prisma.agentMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      session_id: session.id,
      messages: messages.map((message) => ({
        id: message.id,
        sender: message.sender,
        content: message.content,
        confidence_score: message.confidenceScore,
        cited_chunk_ids: message.citedChunkIds,
        created_at: message.createdAt,
      })),
    };
  }

  async getPlan(id: string, user: AuthenticatedUser) {
    await this.assertOwnedSession(id, user.id);
    const steps = await this.prisma.workflowStep.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      steps: steps.map((step) => ({
        step_name: step.stepName,
        tool_name: step.toolName,
        risk_level: step.riskLevel,
        status: step.status,
        rationale: step.rationale,
      })),
    };
  }

  private async assertOwnedSession(id: string, userId: string) {
    const session = await this.prisma.agentSession.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Agent session not found' });
    }
    if (session.userId !== userId) {
      throw new ForbiddenException({ code: 'SESSION_NOT_OWNED', message: 'Session belongs to another user' });
    }
    return session;
  }
}
