import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RiskLevel } from '@prisma/client';
import { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {}

  async create(userId: string, dto: { request_type: string; description: string; department_id?: string; session_id?: string }) {
    const requestType = await this.prisma.requestType.upsert({
      where: { name: dto.request_type },
      update: {},
      create: {
        name: dto.request_type,
        defaultRiskLevel: dto.request_type === 'certificate' || dto.request_type === 'grievance' ? RiskLevel.high : RiskLevel.low,
        defaultSlaHours: 72,
      },
    });

    const slaDueAt = new Date(Date.now() + requestType.defaultSlaHours * 60 * 60 * 1000);
    return this.prisma.serviceRequest.create({
      data: {
        userId,
        sessionId: dto.session_id,
        requestTypeId: requestType.id,
        departmentId: dto.department_id,
        description: dto.description,
        slaDueAt,
      },
    });
  }

  async get(id: string) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found' });
    }
    return request;
  }

  async list(user: AuthenticatedUser, filters: Record<string, string | undefined>) {
    const page = Math.max(Number(filters.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(filters.limit ?? 20), 1), 100);

    let roleWhere: any = {};
    if (user.role === 'student') {
      roleWhere = { userId: user.id };
    } else if (user.role === 'admin') {
      roleWhere = {};
    } else if (user.role === 'warden') {
      roleWhere = {
        OR: [
          { departmentId: user.department_id },
          { requestType: { name: { in: ['maintenance', 'hostel_maintenance', 'hostel'] } } },
          { departmentId: null },
        ],
      };
    } else if (user.role === 'lab_incharge') {
      roleWhere = {
        OR: [
          { departmentId: user.department_id },
          { requestType: { name: { in: ['lab_booking', 'seminar_hall', 'facility'] } } },
          { departmentId: null },
        ],
      };
    } else {
      const isAcademicDept = !user.department_id || user.department_id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      roleWhere = isAcademicDept
        ? {}
        : { OR: [{ departmentId: user.department_id }, { departmentId: null }] };
    }

    const where = {
      ...roleWhere,
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.serviceRequest.findMany({
        where,
        include: { requestType: true, workflowSteps: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        request_type: item.requestType.name,
        status: item.status,
        description: item.description,
        created_at: item.createdAt,
        sla_due_at: item.slaDueAt,
        department_id: item.departmentId,
        session_id: item.sessionId,
      })),
      total,
      page,
    };
  }

  async getDetail(id: string, user: AuthenticatedUser) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        requestType: true,
        workflowSteps: {
          include: { approvals: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!request) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found' });
    }
    if (user.role === 'student' && request.userId !== user.id) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Request belongs to another user' });
    }
    return {
      id: request.id,
      request_type: request.requestType.name,
      status: request.status,
      description: request.description,
      created_at: request.createdAt,
      sla_due_at: request.slaDueAt,
      department_id: request.departmentId,
      session_id: request.sessionId,
      timeline: request.workflowSteps.map((step) => {
        const latestApproval = step.approvals[step.approvals.length - 1];
        return {
          id: step.id,
          step_name: step.stepName,
          tool_name: step.toolName,
          risk_level: step.riskLevel,
          status: step.status,
          rationale: step.rationale,
          executed_at: step.executedAt,
          created_at: step.createdAt,
          question: latestApproval?.question,
          reason: latestApproval?.reason,
          decision: latestApproval?.decision,
        };
      }),
    };
  }

  async updateStatus(id: string, user: AuthenticatedUser, status: string) {
    if (!['staff', 'admin', 'warden', 'lab_incharge'].includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only staff can update request status' });
    }
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: {
        status,
        resolvedAt: ['resolved', 'closed'].includes(status) ? new Date() : undefined,
      },
    });
    this.events.emitToUser(updated.userId, 'status.changed', {
      entity_type: 'request',
      entity_id: updated.id,
      new_status: updated.status,
    });
    return updated;
  }
}
