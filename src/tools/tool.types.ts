import { AuthenticatedUser, RiskLevel, Role } from '../common/types';

export interface ToolExecutionContext {
  user: AuthenticatedUser;
  session_id: string;
  workflow_step_id: string;
  idempotency_key: string;
  approved_approval_id?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema: Record<string, unknown>;
  allowedRoles: Role[];
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>;
}
