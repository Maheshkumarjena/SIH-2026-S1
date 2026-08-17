import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AnalyticsPrisma {
  serviceRequest: {
    groupBy(args: unknown): Promise<Array<Record<string, unknown>>>;
    findMany(args: unknown): Promise<Array<{ status: string; createdAt: Date; resolvedAt: Date | null; requestType: { name: string }; workflowSteps: Array<{ stepName: string; status: string }> }>>;
  };
  workflowStep: {
    findMany(args: unknown): Promise<Array<{ stepName: string; request: { departmentId: string | null; slaDueAt: Date } }>>;
  };
  policyConflictFlag: {
    findMany(args: unknown): Promise<
      Array<{
        id: string;
        docAId: string;
        docAClause: string | null;
        docAVersion: string;
        docBId: string;
        docBClause: string | null;
        docBVersion: string;
        raisedAt: Date;
        status: string;
      }>
    >;
  };
}

@Injectable()
export class AdminAnalyticsService {
  private readonly db: AnalyticsPrisma;

  constructor(prisma: PrismaService) {
    this.db = prisma as unknown as AnalyticsPrisma;
  }

  async requestsSummary() {
    const requests = await this.db.serviceRequest.findMany({
      include: { requestType: true, workflowSteps: false },
    });
    const byType = new Map<string, number>();
    const byStatus = new Map<string, number>();
    for (const request of requests) {
      byType.set(request.requestType.name, (byType.get(request.requestType.name) ?? 0) + 1);
      byStatus.set(request.status, (byStatus.get(request.status) ?? 0) + 1);
    }
    return {
      by_type: [...byType.entries()].map(([request_type, count]) => ({ request_type, count })),
      by_status: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    };
  }

  async resolutionTimeTrend() {
    const requests = await this.db.serviceRequest.findMany({
      where: { resolvedAt: { not: null } },
      include: { requestType: true },
    });
    return {
      points: requests.map((request) => ({
        date: request.resolvedAt?.toISOString().slice(0, 10),
        avg_resolution_hours: request.resolvedAt
          ? Number(((request.resolvedAt.getTime() - request.createdAt.getTime()) / 36e5).toFixed(2))
          : 0,
      })),
    };
  }

  async bottlenecks() {
    const overdue = await this.db.workflowStep.findMany({
      where: { status: { not: 'done' }, request: { slaDueAt: { lt: new Date() } } },
      include: { request: true },
    });
    const grouped = new Map<string, number>();
    for (const step of overdue) {
      const key = `${step.request.departmentId ?? 'unknown'}:${step.stepName}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    return {
      items: [...grouped.entries()].map(([key, overdue_count]) => {
        const [department, step_name] = key.split(':');
        return { department, step_name, overdue_count };
      }),
    };
  }

  async policyConflicts() {
    const items = await this.db.policyConflictFlag.findMany({ orderBy: { raisedAt: 'desc' } });
    return {
      items: items.map((item) => ({
        id: item.id,
        doc_a: { document_id: item.docAId, clause: item.docAClause, version: item.docAVersion },
        doc_b: { document_id: item.docBId, clause: item.docBClause, version: item.docBVersion },
        raised_at: item.raisedAt,
        status: item.status,
      })),
    };
  }
}
