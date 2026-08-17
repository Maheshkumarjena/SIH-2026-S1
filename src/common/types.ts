export type Role = 'student' | 'staff' | 'admin' | 'warden' | 'lab_incharge';

export type SupportedLanguage = 'en' | 'hi' | 'or';

export type RiskLevel = 'low' | 'medium' | 'high';

export type Intent =
  | 'certificate_request'
  | 'maintenance_issue'
  | 'lab_booking'
  | 'grievance'
  | 'general_query'
  | 'small_talk';

export type WorkflowStepStatus =
  | 'pending'
  | 'executing'
  | 'done'
  | 'awaiting_approval'
  | 'failed'
  | 'rejected'
  | 'info_requested';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  department_id: string;
  preferred_language: SupportedLanguage;
}

export interface ChunkResult {
  chunk_id: string;
  content: string;
  source_document: string;
  document_version: string;
  page: number | null;
  clause: string | null;
  similarity: number;
}

export interface GuardrailFlag {
  type: 'prompt_injection' | 'pii' | 'invalid_citation' | 'policy_conflict' | 'unsupported_claim';
  severity: RiskLevel;
  message: string;
  target: 'user_input' | 'retrieved_document' | 'tool_args' | 'final_response';
  metadata?: Record<string, unknown>;
}

export interface PlanStep {
  step_name: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  rationale: string;
  risk_level?: RiskLevel;
  status?: WorkflowStepStatus;
}

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  confidence_score?: number | null;
  cited_chunk_ids?: string[];
  created_at: Date;
}

export interface AgentState {
  session_id: string;
  user: AuthenticatedUser;
  raw_input: string;
  detected_language: SupportedLanguage;
  intent: Intent;
  entities: Record<string, unknown>;
  retrieved_chunks: ChunkResult[];
  retrieval_confidence: number;
  plan: PlanStep[];
  current_step_index: number;
  guardrail_flags: GuardrailFlag[];
  pending_approval_id: string | null;
  clarification_rounds: number;
  retry_counts: Record<string, number>;
  conversation_history: AgentMessage[];
  final_response: string | null;
  error: string | null;
}
