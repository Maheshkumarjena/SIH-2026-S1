import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import Ajv from 'ajv';
import { HashChainService } from '../audit/hash-chain.service';
import { RiskLevel } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ToolExecutionContext } from './tool.types';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class ToolExecutionService {
  private readonly ajv = new Ajv({ coerceTypes: true, allErrors: true });

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly prisma: PrismaService,
    private readonly audit: HashChainService,
  ) {}

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    riskLevel: RiskLevel,
  ): Promise<unknown> {
    if (riskLevel !== 'low' && !context.approved_approval_id) {
      throw new ForbiddenException({ code: 'APPROVAL_REQUIRED', message: 'Medium and high risk tools require approval' });
    }

    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new NotFoundException({ code: 'TOOL_NOT_REGISTERED', message: `Tool ${toolName} is not registered` });
    }
    if (!tool.allowedRoles.includes(context.user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Role cannot execute this tool' });
    }
    const valid = this.ajv.validate(tool.inputSchema, args);
    if (!valid) {
      const errorText = this.ajv.errorsText(this.ajv.errors);
      console.warn(`[ToolExecutionService] ❌ Tool "${toolName}" argument validation failed: ${errorText}`, args);
      throw new BadRequestException({ code: 'INVALID_TOOL_ARGUMENTS', message: `Tool arguments failed schema validation: ${errorText}` });
    }

    const existing = await this.prisma.workflowStep.findUnique({ where: { idempotencyKey: context.idempotency_key } });
    if (existing?.status === 'done' && existing.resultJson) {
      return existing.resultJson;
    }

    let lastError: unknown;
    for (const delayMs of [0, 1000, 3000, 9000].slice(0, 3)) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        await this.prisma.workflowStep.update({
          where: { id: context.workflow_step_id },
          data: { status: 'executing' },
        });
        const result = await tool.execute(args, context);
        await this.prisma.workflowStep.update({
          where: { id: context.workflow_step_id },
          data: { status: 'done', executedAt: new Date(), resultJson: result as object },
        });
        await this.audit.append('agent_sessions', context.session_id, 'N12.tool_execution', 'agent', {
          tool_name: toolName,
          risk_level: riskLevel,
          success: true,
        });
        return result;
      } catch (error) {
        lastError = error;
      }
    }

    await this.prisma.workflowStep.update({
      where: { id: context.workflow_step_id },
      data: { status: 'failed' },
    });
    await this.audit.append('agent_sessions', context.session_id, 'N12.tool_execution', 'agent', {
      tool_name: toolName,
      risk_level: riskLevel,
      success: false,
      error: lastError instanceof Error ? lastError.message : 'unknown',
    });
    throw lastError;
  }
}
