import { ForbiddenException } from '@nestjs/common';
import { ToolExecutionService } from '../src/tools/tool-execution.service';

describe('ToolExecutionService', () => {
  const tool = {
    name: 'issue_certificate',
    description: 'Issue',
    riskLevel: 'high',
    inputSchema: {
      type: 'object',
      required: ['request_id'],
      additionalProperties: false,
      properties: { request_id: { type: 'string' } },
    },
    allowedRoles: ['staff'],
    execute: jest.fn(),
  };
  const registry = { get: jest.fn(() => tool) };
  const prisma = {
    workflowStep: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { append: jest.fn() };
  const service = new ToolExecutionService(registry as never, prisma as never, audit as never);

  it('blocks high-risk tools without approval', async () => {
    await expect(
      service.execute(
        'issue_certificate',
        { request_id: 'r1' },
        {
          user: { id: 'u1', role: 'staff', department_id: 'd1', preferred_language: 'en' },
          session_id: 's1',
          workflow_step_id: 'w1',
          idempotency_key: 'k1',
        },
        'high',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
