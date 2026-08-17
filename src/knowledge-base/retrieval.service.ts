import { Injectable } from '@nestjs/common';
import { ChunkResult } from '../common/types';
import { LlmGateway } from '../llm/llm.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGateway,
  ) {}

  async search(query: string, topK = 8): Promise<ChunkResult[]> {
    const vectorResults = await this.vectorSearch(query, topK);
    if (vectorResults.length > 0) {
      return vectorResults;
    }
    return this.lexicalSearch(query, topK);
  }

  async updateChunkEmbedding(chunkId: string, content: string): Promise<void> {
    const embedding = await this.llm.embed(content);
    const literal = `[${embedding.join(',')}]`;
    await this.prisma.$executeRawUnsafe('UPDATE document_chunks SET embedding = $1::vector WHERE id = $2::uuid', literal, chunkId);
  }

  private async vectorSearch(query: string, topK: number): Promise<ChunkResult[]> {
    try {
      const embedding = await this.llm.embed(query);
      const literal = `[${embedding.join(',')}]`;
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          chunk_id: string;
          content: string;
          source_document: string;
          document_version: string;
          page: number | null;
          clause: string | null;
          similarity: number;
        }>
      >(
        `SELECT c.id::text AS chunk_id,
                c.content,
                d.document_id AS source_document,
                d.version AS document_version,
                c.source_page AS page,
                c.clause,
                GREATEST(0, 1 - (c.embedding <=> $1::vector))::float AS similarity
         FROM document_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
         WHERE c.embedding IS NOT NULL
         ORDER BY c.embedding <=> $1::vector
         LIMIT $2`,
        literal,
        topK,
      );
      return rows.map((row) => ({
        chunk_id: row.chunk_id,
        content: row.content,
        source_document: row.source_document,
        document_version: row.document_version,
        page: row.page,
        clause: row.clause,
        similarity: Number(row.similarity.toFixed(3)),
      }));
    } catch {
      return [];
    }
  }

  private async lexicalSearch(query: string, topK: number): Promise<ChunkResult[]> {
    const chunks = await this.prisma.documentChunk.findMany({
      include: { document: true },
      take: 200,
    });
    const terms = this.terms(query);
    return chunks
      .map((chunk) => {
        const contentTerms = this.terms(chunk.content);
        const overlap = terms.filter((term) => contentTerms.includes(term)).length;
        const denominator = Math.max(1, Math.min(terms.length, 6));
        const titleBoost =
          contentTerms.includes('bonafide') && terms.includes('bonafide')
            ? 0.18
            : contentTerms.includes('grievance') && terms.includes('grievance')
              ? 0.12
              : contentTerms.includes('lab') && terms.includes('lab')
                ? 0.12
                : 0;
        const similarity = Math.min(1, overlap / denominator + titleBoost);
        return {
          chunk_id: chunk.id,
          content: chunk.content,
          source_document: chunk.document.documentId,
          document_version: chunk.document.version,
          page: chunk.sourcePage,
          clause: chunk.clause,
          similarity: Number(similarity.toFixed(3)),
        };
      })
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, topK);
  }

  calculateConfidence(chunks: ChunkResult[], hasGuardrailFailure: boolean): number {
    if (hasGuardrailFailure || chunks.length === 0) {
      return 0;
    }
    const top = chunks[0]?.similarity ?? 0;
    const agreement = chunks.length > 1 ? chunks.slice(0, 4).reduce((sum, chunk) => sum + chunk.similarity, 0) / Math.min(chunks.length, 4) : top;
    return Number(Math.min(1, top * 0.7 + agreement * 0.3).toFixed(3));
  }

  private terms(text: string): string[] {
    return [
      ...new Set(
        text
          .toLowerCase()
          .replace(/[^a-z0-9\u0900-\u097F\u0B00-\u0B7F ]/g, ' ')
          .split(/\s+/)
          .filter((term) => term.length > 2),
      ),
    ];
  }
}
