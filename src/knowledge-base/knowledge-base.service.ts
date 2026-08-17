import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from './retrieval.service';

interface ParsedChunk {
  clause: string | null;
  content: string;
  sourcePage: number;
}

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
  ) {}

  async list() {
    const items = await this.prisma.knowledgeDocument.findMany({
      orderBy: [{ documentId: 'asc' }, { version: 'desc' }],
      include: { chunks: true },
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        document_id: item.documentId,
        version: item.version,
        effective_date: item.effectiveDate,
        status: item.status,
        uploaded_by: item.uploadedBy,
        file_url: item.fileUrl,
        chunk_count: item.chunks.length,
      })),
    };
  }

  async upsertDocument(dto: {
    title: string;
    document_id: string;
    version: string;
    content: string;
    uploaded_by: string;
    effective_date?: string;
    file_url?: string;
  }) {
    const document = await this.prisma.knowledgeDocument.upsert({
      where: { documentId_version: { documentId: dto.document_id, version: dto.version } },
      update: {
        title: dto.title,
        uploadedBy: dto.uploaded_by,
        fileUrl: dto.file_url,
        status: 'active',
        effectiveDate: dto.effective_date ? new Date(dto.effective_date) : undefined,
      },
      create: {
        title: dto.title,
        documentId: dto.document_id,
        version: dto.version,
        uploadedBy: dto.uploaded_by,
        fileUrl: dto.file_url,
        status: 'active',
        effectiveDate: dto.effective_date ? new Date(dto.effective_date) : undefined,
      },
    });

    await this.prisma.documentChunk.deleteMany({ where: { documentId: document.id } });
    const chunks = this.chunkMarkdown(dto.content);
    for (const chunk of chunks) {
      const created = await this.prisma.documentChunk.create({
        data: {
          documentId: document.id,
          content: chunk.content,
          clause: chunk.clause,
          sourcePage: chunk.sourcePage,
        },
      });
      await this.retrieval.updateChunkEmbedding(created.id, created.content);
    }

    return { id: document.id, title: document.title, version: document.version, status: document.status, chunks: chunks.length };
  }

  chunkMarkdown(content: string): ParsedChunk[] {
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/, '').trim();
    const sections = withoutFrontmatter.split(/\n(?=##\s+Clause\s+\d+)/i);
    return sections
      .map((section, index) => {
        const clause = section.match(/^##\s+Clause\s+([^\n]+)/i)?.[1]?.trim() ?? (index === 0 ? 'Overview' : null);
        return {
          clause,
          content: section.trim(),
          sourcePage: index + 1,
        };
      })
      .filter((chunk) => chunk.content.length > 0);
  }
}
