import { Injectable } from '@nestjs/common';
import { ChunkResult, GuardrailFlag, PlanStep } from '../../common/types';

@Injectable()
export class GuardrailService {
  private readonly injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /system\s*prompt/i,
    /developer\s*message/i,
    /act\s+as\s+(an?\s+)?admin/i,
    /bypass\s+(approval|hitl|policy)/i,
    /execute\s+without\s+approval/i,
  ];

  screenUserInput(input: string): GuardrailFlag[] {
    return this.scanText(input, 'user_input');
  }

  screenRetrievedChunks(chunks: ChunkResult[]): GuardrailFlag[] {
    return chunks.flatMap((chunk) =>
      this.scanText(chunk.content, 'retrieved_document').map((flag) => ({
        ...flag,
        metadata: { chunk_id: chunk.chunk_id, source_document: chunk.source_document },
      })),
    );
  }

  screenToolArgs(step: PlanStep): GuardrailFlag[] {
    return this.scanText(JSON.stringify(step.tool_args), 'tool_args');
  }

  validateCitations(citedChunkIds: string[], retrievedChunks: ChunkResult[]): GuardrailFlag[] {
    const retrievedIds = new Set(retrievedChunks.map((chunk) => chunk.chunk_id));
    const invalid = citedChunkIds.filter((chunkId) => !retrievedIds.has(chunkId));
    return invalid.map((chunkId) => ({
      type: 'invalid_citation',
      severity: 'medium',
      target: 'final_response',
      message: `Citation ${chunkId} was not part of retrieved evidence`,
    }));
  }

  validateCitationSupport(
    answer: string,
    citedChunkIds: string[],
    retrievedChunks: ChunkResult[],
    hasToolResults = false,
  ): GuardrailFlag[] {
    const flags = this.validateCitations(citedChunkIds, retrievedChunks);
    const factualTerms = this.significantTerms(answer);
    if (factualTerms.length < 3) {
      return flags;
    }
    if (citedChunkIds.length === 0) {
      if (hasToolResults) {
        return flags;
      }
      return [
        ...flags,
        {
          type: 'unsupported_claim',
          severity: 'medium',
          target: 'final_response',
          message: 'Factual answer did not include citations',
        },
      ];
    }

    const citedText = retrievedChunks
      .filter((chunk) => citedChunkIds.includes(chunk.chunk_id))
      .map((chunk) => chunk.content)
      .join(' ');
    const citedTerms = new Set(this.significantTerms(citedText));
    const supportedTerms = factualTerms.filter((term) => citedTerms.has(term));
    const supportScore = supportedTerms.length / Math.max(1, factualTerms.length);
    if (supportScore < 0.35 && !hasToolResults) {
      flags.push({
        type: 'unsupported_claim',
        severity: 'medium',
        target: 'final_response',
        message: 'Cited evidence does not sufficiently support the answer',
        metadata: { support_score: Number(supportScore.toFixed(3)) },
      });
    }
    return flags;
  }

  minimizeToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    const allowlists: Record<string, string[]> = {
      create_request: ['request_type', 'description', 'department_id', 'session_id', 'request_id'],
      get_student_profile: ['user_id'],
      check_fee_status: ['user_id'],
      get_annual_fee_summary: ['user_id', 'year'],
      get_exam_record: ['user_id', 'course_code'],
      check_lab_availability: ['resource_id', 'start_time', 'end_time'],
      book_lab_slot: ['resource_id', 'start_time', 'end_time', 'course_code', 'faculty_ref', 'section_id'],
      check_seminar_hall_availability: ['hall_id', 'start_time', 'end_time'],
      book_seminar_hall: ['hall_id', 'purpose', 'start_time', 'end_time'],
      notify_department: ['request_id', 'department_id', 'message'],
      escalate_grievance: ['grievance_id', 'reason'],
      issue_certificate: ['request_id', 'certificate_type', 'purpose'],
      render_certificate_document: ['certificate_id'],
    };
    const allowed = allowlists[toolName] ?? [];
    return Object.fromEntries(Object.entries(args).filter(([key]) => allowed.includes(key)));
  }

  detectPolicyConflicts(chunks: ChunkResult[]): GuardrailFlag[] {
    const flags: GuardrailFlag[] = [];
    const hasCurrentGrievancePolicy = chunks.some((chunk) => chunk.source_document === 'ADMIN-GRIEV-002');
    const hasOldComplaintCircular = chunks.some((chunk) => chunk.source_document === 'CIRC-DEPT-2021-014');
    if (hasCurrentGrievancePolicy && hasOldComplaintCircular) {
      flags.push({
        type: 'policy_conflict',
        severity: 'high',
        target: 'retrieved_document',
        message: 'Current grievance policy and older departmental circular contain conflicting grievance timelines/anonymity rules',
        metadata: {
          document_a: 'ADMIN-GRIEV-002',
          document_b: 'CIRC-DEPT-2021-014',
        },
      });
    }
    for (const left of chunks) {
      for (const right of chunks) {
        if (left.chunk_id >= right.chunk_id) {
          continue;
        }
        const sameClause = left.clause && right.clause && left.clause === right.clause;
        const contradictionMarkers = /\b(must not|prohibited|not allowed|never)\b/i.test(left.content) !==
          /\b(must not|prohibited|not allowed|never)\b/i.test(right.content);
        if (sameClause && contradictionMarkers) {
          flags.push({
            type: 'policy_conflict',
            severity: 'high',
            target: 'retrieved_document',
            message: 'Retrieved policy chunks appear to conflict',
            metadata: { chunk_a: left.chunk_id, chunk_b: right.chunk_id },
          });
        }
      }
    }
    return flags;
  }

  private scanText(text: string, target: GuardrailFlag['target']): GuardrailFlag[] {
    return this.injectionPatterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => ({
        type: 'prompt_injection',
        severity: 'high',
        target,
        message: `Potential prompt injection matched ${pattern.source}`,
      }));
  }

  private significantTerms(text: string): string[] {
    const stopwords = new Set([
      'the',
      'and',
      'for',
      'your',
      'you',
      'this',
      'that',
      'with',
      'from',
      'have',
      'been',
      'done',
      'request',
      'completed',
    ]);
    return [
      ...new Set(
        text
          .toLowerCase()
          .replace(/[^a-z0-9\u0900-\u097F\u0B00-\u0B7F ]/g, ' ')
          .split(/\s+/)
          .filter((term) => term.length > 2 && !stopwords.has(term)),
      ),
    ];
  }
}
