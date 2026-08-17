export type LlmTier = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type LlmProvider = 'openai' | 'groq' | 'local';

export interface LlmCallOptions {
  tier: LlmTier;
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  sessionId?: string;
}

export interface LlmCallResult<T> {
  content: T;
  provider: LlmProvider;
  model: string;
  tier: LlmTier;
  latency_ms: number;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  fallback_used: boolean;
}
