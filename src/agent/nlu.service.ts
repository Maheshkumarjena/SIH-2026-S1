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
              enum: [
                'certificate_request',
                'maintenance_issue',
                'lab_booking',
                'grievance',
                'general_query',
                'small_talk',
                'fee_query',
                'exam_record_query',
                'student_profile_query',
              ],
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

  async generateSynthesizedResponse(
    rawInput: string,
    intent: Intent,
    user: { id: string; role: string },
    toolResults: Array<{ tool_name: string; result: unknown }>,
    retrievedChunks: any[],
    sessionId: string,
  ): Promise<string> {
    const systemPrompt = `You are Campus Copilot, a helpful, polite, and authoritative AI assistant for university students and staff.
Formulate a complete, clear, and professional markdown response answering the user's request.
Rules:
1. Use the provided Tool Execution Results (ground truth database records) to directly answer user queries about fee receipts, payments, exam marks, lab bookings, certificates, or student profiles.
2. Clearly format numbers, currency (e.g. ₹), payment receipts, registration IDs, or status details using clean markdown bullet lists or bold key-value pairs.
3. If document chunks are relevant, incorporate policy details cleanly.
4. Keep tone polite, direct, and helpful without unnecessary boilerplate.`;

    const userPrompt = `User Query: "${rawInput}"
Intent: ${intent}
User Context: User ID: ${user.id}, Role: ${user.role}

Tool Execution Results (Database Ground Truth):
${JSON.stringify(toolResults, null, 2)}

Retrieved Document Context:
${JSON.stringify(retrievedChunks.map((c) => ({ document: c.source_document, content: c.content })), null, 2)}`;

    try {
      const response = await this.llm.call<string>({
        tier: 'A',
        sessionId,
        system: systemPrompt,
        user: userPrompt,
      });
      return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    } catch {
      if (toolResults && toolResults.length > 0) {
        return `Here are the details for your request:\n\n\`\`\`json\n${JSON.stringify(toolResults[0]?.result ?? toolResults, null, 2)}\n\`\`\``;
      }
      return `I processed your ${intent.replace(/_/g, ' ')} request successfully.`;
    }
  }

  private fallbackNlu(input: string): NluResult {
    const normalized = input.toLowerCase();
    if (
      normalized.includes('fee') ||
      normalized.includes('receipt') ||
      normalized.includes('dues') ||
      normalized.includes('payment') ||
      normalized.includes('tuition') ||
      normalized.includes('paid')
    ) {
      const yearMatch = normalized.match(/(1st|2nd|3rd|4th|year\s*1|year\s*2|year\s*3|year\s*4|\b1\b|\b2\b|\b3\b|\b4\b)/i);
      let year: number | undefined = undefined;
      if (yearMatch) {
        if (yearMatch[0].includes('1')) year = 1;
        else if (yearMatch[0].includes('2')) year = 2;
        else if (yearMatch[0].includes('3')) year = 3;
        else if (yearMatch[0].includes('4')) year = 4;
      }
      return { intent: 'fee_query', entities: { year } };
    }
    if (normalized.includes('exam') || normalized.includes('mark') || normalized.includes('score') || normalized.includes('grade') || normalized.includes('result')) {
      return { intent: 'exam_record_query', entities: {} };
    }
    if (normalized.includes('profile') || normalized.includes('roll') || normalized.includes('registration')) {
      return { intent: 'student_profile_query', entities: {} };
    }
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
