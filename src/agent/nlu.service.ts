import { Injectable } from '@nestjs/common';
import { Intent, SupportedLanguage } from '../common/types';
import { LlmGateway } from '../llm/llm.gateway';

interface NluResult {
  intent: Intent;
  entities: Record<string, unknown>;
}

@Injectable()
export class NluService {
  constructor(private readonly llm: LlmGateway) {}

  async detectLanguage(input: string, sessionId: string): Promise<SupportedLanguage> {
    try {
      const result = await this.llm.call<{ language: SupportedLanguage }>({
        tier: 'B',
        sessionId,
        system: 'Return only the language code for the user message.',
        user: input,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['language'],
          properties: { language: { enum: ['en', 'hi', 'or'] } },
        },
      });
      return result.content.language;
    } catch {
      if (/[\u0900-\u097F]/.test(input)) return 'hi';
      if (/[\u0B00-\u0B7F]/.test(input)) return 'or';
      return 'en';
    }
  }

  async classifyAndExtract(input: string, sessionId: string): Promise<NluResult> {
    try {
      const result = await this.llm.call<NluResult>({
        tier: 'B',
        sessionId,
        system: 'Classify campus-service intent and extract only useful structured entities.',
        user: input,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['intent', 'entities'],
          properties: {
            intent: {
              enum: ['certificate_request', 'maintenance_issue', 'lab_booking', 'grievance', 'general_query', 'small_talk'],
            },
            entities: { type: 'object' },
          },
        },
      });
      return result.content;
    } catch {
      return this.fallbackNlu(input);
    }
  }

  private fallbackNlu(input: string): NluResult {
    const normalized = input.toLowerCase();
    if (normalized.includes('certificate') || normalized.includes('bonafide')) {
      return {
        intent: 'certificate_request',
        entities: {
          certificate_type: normalized.includes('bonafide') ? 'bonafide' : 'certificate',
          purpose: normalized.includes('scholarship') ? 'scholarship' : undefined,
        },
      };
    }
    if (normalized.includes('ac') || normalized.includes('repair') || normalized.includes('maintenance')) {
      return { intent: 'maintenance_issue', entities: { issue: input } };
    }
    if (normalized.includes('lab') || normalized.includes('slot') || normalized.includes('booking')) {
      return { intent: 'lab_booking', entities: { request: input } };
    }
    if (normalized.includes('grievance') || normalized.includes('complaint')) {
      return { intent: 'grievance', entities: { description: input } };
    }
    return { intent: 'general_query', entities: {} };
  }
}
