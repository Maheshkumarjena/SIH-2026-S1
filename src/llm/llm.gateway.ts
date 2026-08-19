import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { HashChainService } from '../audit/hash-chain.service';
import { LlmCallOptions, LlmCallResult, LlmProvider, LlmTier } from './llm.types';

interface ProviderConfig {
  provider: LlmProvider;
  model: string;
}

@Injectable()
export class LlmGateway {
  private readonly circuits = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly audit: HashChainService,
  ) {}

  async call<T>(options: LlmCallOptions): Promise<LlmCallResult<T>> {
    const primary = this.getTierConfig(options.tier, false);
    const fallback = this.getTierConfig(options.tier, true);
    const primaryAvailable = !this.isCircuitOpen(options.tier, primary.provider);

    if (primaryAvailable) {
      try {
        return await this.callProvider<T>(options, primary, false);
      } catch (error) {
        if (!this.isFallbackEligible(error)) {
          throw error;
        }
        this.tripCircuit(options.tier, primary.provider);
        await this.auditProviderFailure(options, primary, error);
      }
    }

    try {
      return await this.callProvider<T>(options, fallback, true);
    } catch (error) {
      await this.auditProviderFailure(options, fallback, error);
      throw new ServiceUnavailableException({ code: 'LLM_UNAVAILABLE', message: 'LLM provider unavailable' });
    }
  }

  async embed(input: string, sessionId?: string): Promise<number[]> {
    const providerConfig = {
      provider: (this.config.get<string>('EMBEDDING_PROVIDER') ?? this.config.get<string>('LLM_TIER_D_PROVIDER') ?? 'local') as LlmProvider,
      model: this.config.get<string>('EMBEDDING_MODEL') ?? this.config.get<string>('LLM_TIER_D_MODEL') ?? 'local-hash-1536',
    };
    const started = Date.now();
    if (providerConfig.provider === 'openai' && this.config.get<string>('OPENAI_API_KEY')) {
      const client = this.createClient('openai');
      const response = await this.withTimeout(
        client.embeddings.create({
          model: providerConfig.model,
          input,
        }),
      );
      const embedding = response.data[0]?.embedding ?? this.localEmbedding(input);
      await this.auditEmbedding(sessionId, providerConfig.provider, providerConfig.model, Date.now() - started, true);
      return embedding;
    }
    const embedding = this.localEmbedding(input);
    await this.auditEmbedding(sessionId, 'local', 'local-hash-1536', Date.now() - started, true);
    return embedding;
  }

  private async callProvider<T>(options: LlmCallOptions, providerConfig: ProviderConfig, fallbackUsed: boolean): Promise<LlmCallResult<T>> {
    const started = Date.now();
    if (providerConfig.provider === 'local') {
      throw new ServiceUnavailableException({ code: 'LLM_UNAVAILABLE', message: 'Local provider is not configured for chat calls' });
    }

    const client = this.createClient(providerConfig.provider);
    const response = await this.withTimeout(
      client.chat.completions.create({
        model: providerConfig.model,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
        response_format: options.schema
          ? {
              type: 'json_schema',
              json_schema: {
                name: 'agent_response',
                strict: true,
                schema: options.schema,
              },
            }
          : undefined,
      }),
    );

    const latency = Date.now() - started;
    const raw = response.choices[0]?.message?.content ?? '';
    const content = options.schema ? (JSON.parse(raw) as T) : (raw as T);

    if (options.sessionId) {
      await this.audit.append('agent_sessions', options.sessionId, 'llm.call', 'agent', {
        provider: providerConfig.provider,
        model: providerConfig.model,
        tier: options.tier,
        latency_ms: latency,
        success: true,
        fallback_used: fallbackUsed,
        tokens: {
          input: response.usage?.prompt_tokens,
          output: response.usage?.completion_tokens,
          total: response.usage?.total_tokens,
        },
      });
    }

    return {
      content,
      provider: providerConfig.provider,
      model: providerConfig.model,
      tier: options.tier,
      latency_ms: latency,
      fallback_used: fallbackUsed,
      tokens: {
        input: response.usage?.prompt_tokens,
        output: response.usage?.completion_tokens,
        total: response.usage?.total_tokens,
      },
    };
  }

  private createClient(provider: LlmProvider): OpenAI {
    if (provider === 'groq') {
      return new OpenAI({
        apiKey: this.config.get<string>('GROQ_API_KEY') ?? '',
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
    return new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '' });
  }

  private localEmbedding(input: string): number[] {
    const dims = 1536;
    const vector = Array.from({ length: dims }, () => 0);
    const terms = input
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F\u0B00-\u0B7F ]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 1);
    for (const term of terms) {
      let hash = 2166136261;
      for (const char of term) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      const index = Math.abs(hash) % dims;
      vector[index] += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => Number((value / norm).toFixed(6)));
  }

  private async auditEmbedding(sessionId: string | undefined, provider: LlmProvider, model: string, latencyMs: number, success: boolean): Promise<void> {
    if (!sessionId) {
      return;
    }
    await this.audit.append('agent_sessions', sessionId, 'llm.embedding', 'agent', {
      provider,
      model,
      tier: 'D',
      latency_ms: latencyMs,
      success,
    });
  }

  private getTierConfig(tier: LlmTier, fallback: boolean): ProviderConfig {
    const prefix = fallback ? `LLM_TIER_${tier}_FALLBACK` : `LLM_TIER_${tier}`;
    return {
      provider: (this.config.get<string>(`${prefix}_PROVIDER`) ?? 'openai') as LlmProvider,
      model: this.config.get<string>(`${prefix}_MODEL`) ?? 'gpt-4o-mini',
    };
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutMs = this.config.get<number>('LLM_TIMEOUT_MS') ?? 12000;
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('LLM_TIMEOUT')), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private isFallbackEligible(error: unknown): boolean {
    const candidate = error as { status?: number; message?: string };
    return candidate.status === 429 || (candidate.status !== undefined && candidate.status >= 500) || candidate.message === 'LLM_TIMEOUT';
  }

  private tripCircuit(tier: LlmTier, provider: LlmProvider): void {
    const cooldownMs = this.config.get<number>('LLM_CIRCUIT_BREAKER_COOLDOWN_MS') ?? 60000;
    this.circuits.set(`${tier}:${provider}`, Date.now() + cooldownMs);
  }

  private isCircuitOpen(tier: LlmTier, provider: LlmProvider): boolean {
    const until = this.circuits.get(`${tier}:${provider}`) ?? 0;
    return until > Date.now();
  }

  private async auditProviderFailure(options: LlmCallOptions, providerConfig: ProviderConfig, error: unknown): Promise<void> {
    if (!options.sessionId) {
      return;
    }
    const candidate = error as { status?: number; message?: string };
    await this.audit.append('agent_sessions', options.sessionId, 'llm.fallback', 'agent', {
      provider: providerConfig.provider,
      model: providerConfig.model,
      tier: options.tier,
      success: false,
      status: candidate.status,
      error: candidate.message,
    });
  }
}
