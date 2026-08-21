import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HashChainService } from '../audit/hash-chain.service';
import { AuthenticatedUser } from '../common/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';
import { ToolExecutionService } from '../tools/tool-execution.service';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolExecutionService,
    private readonly audit: HashChainService,
    private readonly events: EventDispatcherService,
    private readonly notifications: NotificationsService,
  ) {}

  async createForStep(workflowStepId: string, context: Record<string, unknown>) {
    const approvalBase = await this.prisma.approval.create({
      data: {
        workflowStepId,
        contextJson: context as Prisma.InputJsonValue,
      },
    });
    const approval = await this.prisma.approval.findUniqueOrThrow({
      where: { id: approvalBase.id },
      include: { workflowStep: { include: { request: true } } },
    });
    await this.prisma.workflowStep.update({
      where: { id: workflowStepId },
      data: { status: 'awaiting_approval' },
    });
    if (approval.workflowStep.requestId) {
      await this.prisma.serviceRequest.update({
        where: { id: approval.workflowStep.requestId },
        data: { status: 'awaiting_approval' },
      });
    }
    const studentUserId = approval.workflowStep.request?.userId;
    if (studentUserId) {
      this.events.emitToUser(studentUserId, 'status.changed', {
        entity_type: 'request',
        entity_id: approval.workflowStep.requestId,
        new_status: 'awaiting_approval',
      });
    }
    await this.audit.append('agent_sessions', approval.workflowStep.sessionId, 'N13.approval_creation', 'agent', {
      approval_id: approval.id,
      workflow_step_id: workflowStepId,
      risk_level: approval.workflowStep.riskLevel,
    });
    this.events.emitToSession(approval.workflowStep.sessionId, 'approval.created', { approval });
    this.events.emitToSession(approval.workflowStep.sessionId, 'approval.status', {
      session_id: approval.workflowStep.sessionId,
      approval_id: approval.id,
      status: 'pending',
    });
    return approval;
  }

  async listPending(user: AuthenticatedUser) {
    if (!['staff', 'admin', 'warden', 'lab_incharge'].includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Approvals require staff access' });
    }
    const allPending = await this.prisma.approval.findMany({
      where: { decision: null },
      include: {
        workflowStep: {
          include: {
            request: {
              include: {
                requestType: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const filtered = allPending.filter((item) => {
      if (user.role === 'admin') return true;

      const toolName = item.workflowStep?.toolName ?? '';
      const reqType = item.workflowStep?.request?.requestType?.name ?? '';
      const reqDeptId = item.workflowStep?.request?.departmentId;

      if (user.role === 'warden') {
        if (['issue_certificate', 'book_lab_slot', 'check_lab_availability'].includes(toolName)) return false;
        if (['certificate', 'lab_booking'].includes(reqType)) return false;
        return true;
      }

      if (user.role === 'lab_incharge') {
        if (['issue_certificate'].includes(toolName)) return false;
        if (['certificate', 'hostel_maintenance'].includes(reqType)) return false;
        return true;
      }

      if (user.role === 'staff') {
        const isAcademicDept = !user.department_id || user.department_id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        if (!isAcademicDept && reqDeptId && reqDeptId !== user.department_id) {
          return false;
        }
        return true;
      }

      return true;
    });

    return { items: filtered };
  }

  async approve(id: string, reviewer: AuthenticatedUser) {
    if (!['staff', 'admin', 'warden', 'lab_incharge'].includes(reviewer.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Approvals require staff access' });
    }

    const approval = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM approvals WHERE id = $1::uuid FOR UPDATE', id);
      const existing = await tx.approval.findUnique({
        where: { id },
        include: { workflowStep: true },
      });
      if (!existing) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Approval not found' });
      }
      const updated = await tx.approval.updateMany({
        where: { id, decision: null },
        data: { decision: 'approved', reviewerId: reviewer.id, decidedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException({ code: 'ALREADY_ACTIONED', message: 'Approval has already been actioned' });
      }
      return existing;
    });

    const step = approval.workflowStep;
    const result = await this.tools.execute(
      step.toolName,
      step.toolArgs as Record<string, unknown>,
      {
        user: reviewer,
        session_id: step.sessionId,
        workflow_step_id: step.id,
        idempotency_key: step.idempotencyKey,
        approved_approval_id: id,
      },
      step.riskLevel,
    );

    await this.audit.append('agent_sessions', step.sessionId, 'N14.approval_resume', reviewer.id, {
      approval_id: id,
      workflow_step_id: step.id,
      decision: 'approved',
    });
    this.events.emitToSession(step.sessionId, 'approval.actioned', { approval_id: id, decision: 'approved' });
    this.events.emitToSession(step.sessionId, 'approval.status', {
      session_id: step.sessionId,
      approval_id: id,
      status: 'approved',
    });
    await this.continueAfterApproval(step.sessionId, reviewer);
    return { id, decision: 'approved', executed: true, executed_at: new Date(), result };
  }

  async reject(id: string, reviewer: AuthenticatedUser, reason: string) {
    const approval = await this.actionWithoutExecution(id, reviewer, 'rejected', reason);
    await this.prisma.workflowStep.update({
      where: { id: approval.workflowStep.id },
      data: { status: 'rejected' },
    });
    if (approval.workflowStep.requestId) {
      await this.prisma.serviceRequest.update({
        where: { id: approval.workflowStep.requestId },
        data: { status: 'rejected', resolvedAt: new Date() },
      });
    }
    const studentUserId = approval.workflowStep.request?.userId;
    if (studentUserId) {
      this.events.emitToUser(studentUserId, 'status.changed', {
        entity_type: 'request',
        entity_id: approval.workflowStep.requestId,
        new_status: 'rejected',
      });
    }
    await this.notifications.create(approval.workflowStep.request.userId, {
      title: 'Approval rejected',
      body: reason,
      deepLink: `/chat?session=${approval.workflowStep.sessionId}`,
    });
    await this.audit.append('agent_sessions', approval.workflowStep.sessionId, 'N15.rejection', reviewer.id, {
      approval_id: id,
      reason,
    });
    this.events.emitToSession(approval.workflowStep.sessionId, 'approval.actioned', { approval_id: id, decision: 'rejected' });
    return { id, decision: 'rejected', reason };
  }

  async requestInfo(id: string, reviewer: AuthenticatedUser, question: string) {
    const approval = await this.actionWithoutExecution(id, reviewer, 'info_requested', undefined, question);
    await this.prisma.workflowStep.update({
      where: { id: approval.workflowStep.id },
      data: { status: 'info_requested' },
    });
    if (approval.workflowStep.requestId) {
      await this.prisma.serviceRequest.update({
        where: { id: approval.workflowStep.requestId },
        data: { status: 'info_requested' },
      });
    }
    const studentUserId = approval.workflowStep.request?.userId;
    const message = await this.prisma.agentMessage.create({
      data: {
        sessionId: approval.workflowStep.sessionId,
        sender: 'agent',
        content: `Staff requested clarification: "${question}"`,
        citedChunkIds: [],
      },
    });

    if (studentUserId) {
      await this.notifications.create(studentUserId, {
        title: 'Staff requested additional information',
        body: question,
        deepLink: `/chat?session=${approval.workflowStep.sessionId}`,
      });
      this.events.emitToUser(studentUserId, 'notification.new', {
        title: 'Staff requested additional information',
        body: question,
        deepLink: `/chat?session=${approval.workflowStep.sessionId}`,
      });
      this.events.emitToUser(studentUserId, 'status.changed', {
        entity_type: 'request',
        entity_id: approval.workflowStep.requestId,
        new_status: 'info_requested',
      });
    }

    this.events.emitToSession(approval.workflowStep.sessionId, 'message.complete', {
      session_id: approval.workflowStep.sessionId,
      message,
    });
    this.events.emitToSession(approval.workflowStep.sessionId, 'approval.status', {
      session_id: approval.workflowStep.sessionId,
      approval_id: id,
      status: 'info_requested',
      question,
    });
    await this.audit.append('agent_sessions', approval.workflowStep.sessionId, 'N14.request_info', reviewer.id, {
      approval_id: id,
      question,
    });
    return { id, decision: 'info_requested' };
  }

  private async actionWithoutExecution(
    id: string,
    reviewer: AuthenticatedUser,
    decision: 'rejected' | 'info_requested',
    reason?: string,
    question?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM approvals WHERE id = $1::uuid FOR UPDATE', id);
      const existing = await tx.approval.findUnique({
        where: { id },
        include: { workflowStep: { include: { request: true } } },
      });
      if (!existing) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Approval not found' });
      }
      const updated = await tx.approval.updateMany({
        where: { id, decision: null },
        data: { decision, reviewerId: reviewer.id, decidedAt: new Date(), reason, question },
      });
      if (updated.count !== 1) {
        throw new ConflictException({ code: 'ALREADY_ACTIONED', message: 'Approval has already been actioned' });
      }
      return existing;
    });
  }

  private async continueAfterApproval(sessionId: string, reviewer: AuthenticatedUser): Promise<void> {
    const steps = await this.prisma.workflowStep.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      include: { request: true },
    });

    const currentIndex = steps.findIndex((step) => step.status !== 'done' && step.status !== 'rejected' && step.status !== 'failed');
    const remaining = currentIndex === -1 ? [] : steps.slice(currentIndex);

    for (const step of remaining) {
      if (step.status === 'done') {
        continue;
      }
      if (step.riskLevel !== 'low') {
        if (step.status !== 'awaiting_approval') {
          await this.createForStep(step.id, { resumed_after_approval: true });
        }
        return;
      }
      await this.tools.execute(
        step.toolName,
        step.toolArgs as Record<string, unknown>,
        {
          user: reviewer,
          session_id: step.sessionId,
          workflow_step_id: step.id,
          idempotency_key: step.idempotencyKey,
        },
        'low',
      );
    }

    const refreshed = await this.prisma.workflowStep.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
    this.events.emitToSession(sessionId, 'plan.update', {
      session_id: sessionId,
      steps: refreshed.map((step) => ({
        step_name: step.stepName,
        tool_name: step.toolName,
        risk_level: step.riskLevel,
        status: step.status,
        rationale: step.rationale,
      })),
    });

    const lastRequest = steps[0]?.request;
    if (lastRequest) {
      await this.prisma.serviceRequest.update({
        where: { id: lastRequest.id },
        data: { status: 'completed', resolvedAt: new Date() },
      });
      await this.notifications.create(lastRequest.userId, {
        title: 'Agent request completed',
        body: 'The approved action has been completed.',
        deepLink: `/chat?session=${sessionId}`,
      });
      this.events.emitToUser(lastRequest.userId, 'status.changed', {
        entity_type: 'request',
        entity_id: lastRequest.id,
        new_status: 'completed',
      });
      this.events.emitToUser(lastRequest.userId, 'notification.new', {
        title: 'Agent request completed',
        body: 'The approved action has been completed.',
        deepLink: `/chat?session=${sessionId}`,
      });
      const message = await this.prisma.agentMessage.create({
        data: {
          sessionId,
          sender: 'agent',
          content: 'The staff-approved action is complete. Your request has been updated to completed.',
          confidenceScore: null,
          citedChunkIds: [],
        },
      });
      this.events.emitToSession(sessionId, 'message.complete', { session_id: sessionId, message });
    }
    await this.audit.append('agent_sessions', sessionId, 'N16.final_notification', reviewer.id, {
      resumed_after_approval: true,
    });
    await this.audit.append('agent_sessions', sessionId, 'N17.audit_log_final', reviewer.id, {
      status: 'complete_after_approval',
    });
  }
}
