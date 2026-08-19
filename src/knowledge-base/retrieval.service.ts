import { Injectable, Logger } from '@nestjs/common';
import { ChunkResult } from '../common/types';
import { LlmGateway } from '../llm/llm.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGateway,
  ) {}

  /**
   * Main Search Pipeline:
   * 1. Query Embedding (OpenAI text-embedding-3-small)
   * 2. Hybrid Retrieval (Semantic pgvector + Full-text tsvector) -> top 12 candidate pool
   * 3. Reranking (Groq Tier B scoring call) -> top 6 highest-relevance chunks
   */
  async search(query: string, topK = 6, sessionId?: string): Promise<ChunkResult[]> {
    this.logger.log(`🔍 [RAG Search] Starting Hybrid Retrieval + Reranking pipeline for: "${query.slice(0, 60)}"`);
    
    // Step 1: Hybrid Retrieval -> Fetch top 12 candidate chunks
    const candidateChunks = await this.hybridSearch(query, 12, sessionId);

    if (candidateChunks.length === 0) {
      this.logger.warn(`⚠️ [RAG Search] No candidate chunks found for query`);
      return [];
    }

    // Step 2: Reranker (Groq Tier B) -> Rerank top 12 candidates down to top 6
    const rerankedChunks = await this.rerank(query, candidateChunks, topK, sessionId);
    this.logger.log(`✅ [RAG Search] Hybrid Search + Rerank complete: ${rerankedChunks.length} chunks selected`);
    return rerankedChunks;
  }

  /**
   * Hybrid Search:
   * Combines pgvector semantic search and PostgreSQL full-text search (tsvector)
   * using Reciprocal Rank Fusion (RRF).
   */
  async hybridSearch(query: string, topCandidateK = 12, sessionId?: string): Promise<ChunkResult[]> {
    const [semanticResults, ftsResults] = await Promise.all([
      this.vectorSearch(query, topCandidateK, sessionId).catch((err) => {
        this.logger.warn(`Vector search failed, continuing with FTS: ${err?.message}`);
        return [] as ChunkResult[];
      }),
      this.fullTextSearch(query, topCandidateK).catch((err) => {
        this.logger.warn(`Full-text search failed: ${err?.message}`);
        return [] as ChunkResult[];
      }),
    ]);

    // Fallback if both DB methods return empty: run in-memory lexical fallback
    if (semanticResults.length === 0 && ftsResults.length === 0) {
      return this.lexicalSearch(query, topCandidateK);
    }

    return this.reciprocalRankFusion(semanticResults, ftsResults, topCandidateK);
  }

  /**
   * Semantic Search using pgvector cosine distance (<=>)
   */
  private async vectorSearch(query: string, topK: number, sessionId?: string): Promise<ChunkResult[]> {
    try {
      const embedding = await this.llm.embed(query, sessionId);
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
           AND vector_dims(c.embedding) = vector_dims($1::vector)
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
    } catch (err: any) {
      this.logger.debug(`vectorSearch error: ${err?.message}`);
      return [];
    }
  }

  /**
   * PostgreSQL Full-Text Search (tsvector / ts_rank_cd)
   */
  private async fullTextSearch(query: string, topK: number): Promise<ChunkResult[]> {
    try {
      const terms = this.terms(query);
      const tsQuery = terms.length > 0 ? terms.join(' | ') : query;

      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          chunk_id: string;
          content: string;
          source_document: string;
          document_version: string;
          page: number | null;
          clause: string | null;
          fts_score: number;
        }>
      >(
        `SELECT c.id::text AS chunk_id,
                c.content,
                d.document_id AS source_document,
                d.version AS document_version,
                c.source_page AS page,
                c.clause,
                ts_rank_cd(to_tsvector('english', c.content), to_tsquery('english', $1))::float AS fts_score
         FROM document_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
         WHERE to_tsvector('english', c.content) @@ to_tsquery('english', $1)
            OR to_tsvector('english', coalesce(c.clause, '')) @@ to_tsquery('english', $1)
         ORDER BY fts_score DESC
         LIMIT $2`,
        tsQuery,
        topK,
      );

      return rows.map((row) => ({
        chunk_id: row.chunk_id,
        content: row.content,
        source_document: row.source_document,
        document_version: row.document_version,
        page: row.page,
        clause: row.clause,
        similarity: Number(Math.min(1, row.fts_score).toFixed(3)),
      }));
    } catch (err: any) {
      this.logger.debug(`fullTextSearch error: ${err?.message}`);
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF) to merge Semantic and Lexical Search results.
   * Formula: RRF_score(d) = sum( 1 / (k + rank(d)) ) with k = 60
   */
  private reciprocalRankFusion(
    semanticResults: ChunkResult[],
    ftsResults: ChunkResult[],
    topK: number,
    k = 60,
  ): ChunkResult[] {
    const chunkMap = new Map<string, { chunk: ChunkResult; score: number }>();

    semanticResults.forEach((chunk, rankIndex) => {
      const rrfScore = 1 / (k + rankIndex + 1);
      chunkMap.set(chunk.chunk_id, {
        chunk,
        score: rrfScore,
      });
    });

    ftsResults.forEach((chunk, rankIndex) => {
      const rrfScore = 1 / (k + rankIndex + 1);
      const existing = chunkMap.get(chunk.chunk_id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        chunkMap.set(chunk.chunk_id, {
          chunk,
          score: rrfScore,
        });
      }
    });

    const sorted = Array.from(chunkMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Normalize RRF scores to [0.5, 1.0] range for confidence calculation
    const maxScore = sorted[0]?.score || 1;
    return sorted.map(({ chunk, score }) => ({
      ...chunk,
      similarity: Number(Math.min(1, 0.5 + (score / maxScore) * 0.5).toFixed(3)),
    }));
  }

  /**
   * Reranking Top Candidates (Top-12 -> Top-6) using Groq Tier B LLM.
   */
  async rerank(
    query: string,
    candidates: ChunkResult[],
    topK = 6,
    sessionId?: string,
  ): Promise<ChunkResult[]> {
    if (candidates.length <= topK) {
      return candidates;
    }

    try {
      const chunkContexts = candidates.map((c, i) => ({
        index: i + 1,
        chunk_id: c.chunk_id,
        source: `${c.source_document} (${c.clause || 'Overview'})`,
        content: c.content.slice(0, 300),
      }));

      const result = await this.llm.call<{
        scores: Array<{ chunk_id: string; relevance_score: number; rationale?: string }>;
      }>({
        tier: 'B',
        sessionId,
        system: `You are an expert retrieval reranker for a campus service knowledge base.
Evaluate how directly and accurately each candidate document chunk answers or pertains to the user query.
Assign a relevance_score between 0.00 (irrelevant) and 1.00 (perfect direct answer).
Return only the structured JSON with chunk_id, relevance_score, and a short rationale.`,
        user: `User Query: "${query}"

Candidate Chunks:
${JSON.stringify(chunkContexts, null, 2)}`,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['scores'],
          properties: {
            scores: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['chunk_id', 'relevance_score', 'rationale'],
                properties: {
                  chunk_id: { type: 'string' },
                  relevance_score: { type: 'number' },
                  rationale: { type: 'string' },
                },
              },
            },
          },
        },
      });

      const scoreMap = new Map<string, number>();
      for (const item of result.content.scores || []) {
        scoreMap.set(item.chunk_id, item.relevance_score);
      }

      // Sort candidate chunks according to LLM reranker scores
      const reranked = candidates
        .map((chunk) => {
          const llmScore = scoreMap.get(chunk.chunk_id);
          const finalScore = llmScore !== undefined ? Number(llmScore.toFixed(3)) : chunk.similarity;
          return { ...chunk, similarity: finalScore };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

      return reranked;
    } catch (error: any) {
      this.logger.warn(`⚠️ Reranker LLM call failed (${error?.message}), falling back to hybrid RRF scores.`);
      return candidates.slice(0, topK);
    }
  }

  async updateChunkEmbedding(chunkId: string, content: string): Promise<void> {
    const embedding = await this.llm.embed(content);
    const literal = `[${embedding.join(',')}]`;
    await this.prisma.$executeRawUnsafe(
      'UPDATE document_chunks SET embedding = $1::vector WHERE id = $2::uuid',
      literal,
      chunkId,
    );
  }

  calculateConfidence(chunks: ChunkResult[], hasGuardrailFailure: boolean): number {
    if (hasGuardrailFailure || chunks.length === 0) {
      return 0;
    }
    const top = chunks[0]?.similarity ?? 0;
    const agreement =
      chunks.length > 1
        ? chunks.slice(0, 4).reduce((sum, chunk) => sum + chunk.similarity, 0) /
          Math.min(chunks.length, 4)
        : top;
    return Number(Math.min(1, top * 0.7 + agreement * 0.3).toFixed(3));
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
