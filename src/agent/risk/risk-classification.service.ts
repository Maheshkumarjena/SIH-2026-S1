import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanStep, RiskLevel } from '../../common/types';

const rank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
const irreversibleActions = new Set(['issue_certificate', 'escalate_grievance_to_dean', 'escalate_grievance']);
const mediumPiiActions = new Set(['notify_department', 'create_request']);

@Injectable()
export class RiskClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  async classify(step: PlanStep, requestTypeName?: string): Promise<{ risk_level: RiskLevel; rationale: string }> {
    const requestType = requestTypeName
      ? await this.prisma.requestType.findUnique({ where: { name: requestTypeName } })
      : null;

    let risk = (requestType?.defaultRiskLevel?.toLowerCase() as RiskLevel | undefined) ?? step.risk_level ?? 'medium';
    const reasons = [`base=${risk}`];

    if (irreversibleActions.has(step.tool_name)) {
      risk = this.max(risk, 'high');
      reasons.push('irreversible_action_floor=high');
    }

    if (this.touchesSensitivePii(step) && mediumPiiActions.has(step.tool_name)) {
      risk = this.max(risk, 'medium');
      reasons.push('sensitive_pii_floor=medium');
    }

    return { risk_level: risk, rationale: reasons.join('; ') };
  }

  private max(left: RiskLevel, right: RiskLevel): RiskLevel {
    return rank[left] >= rank[right] ? left : right;
  }

  private touchesSensitivePii(step: PlanStep): boolean {
    const serialized = JSON.stringify(step.tool_args).toLowerCase();
    return ['phone', 'email', 'aadhaar', 'disciplinary', 'medical', 'address'].some((field) => serialized.includes(field));
  }
}
