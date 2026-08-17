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

  minimizeToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    const allowlists: Record<string, string[]> = {
      create_request: ['request_type', 'description', 'department_id', 'session_id'],
      check_lab_availability: ['resource_id', 'start_time', 'end_time'],
      book_lab_slot: ['resource_id', 'start_time', 'end_time', 'course_code', 'faculty_ref'],
      notify_department: ['request_id', 'department_id', 'message'],
      escalate_grievance: ['grievance_id', 'reason'],
      issue_certificate: ['request_id', 'certificate_type', 'purpose'],
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
}
