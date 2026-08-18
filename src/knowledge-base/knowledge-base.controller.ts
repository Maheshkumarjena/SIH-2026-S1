import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { AuthenticatedUser } from '../common/types';
import { SearchKnowledgeBaseDto, UpsertKnowledgeDocumentDto } from './dto';
import { KnowledgeBaseService } from './knowledge-base.service';
import { RetrievalService } from './retrieval.service';

@UseGuards(MockJwtAuthGuard)
@Controller('kb')
export class KnowledgeBaseController {
  constructor(
    private readonly kb: KnowledgeBaseService,
    private readonly retrieval: RetrievalService,
  ) {}

  @Get('documents')
  async list() {
    console.log(`[KnowledgeBaseController.list] 📚 Listing all knowledge base documents`);
    const result = await this.kb.list();
    console.log(`[KnowledgeBaseController.list] ✅ Returned ${result?.items?.length ?? 0} documents`);
    return result;
  }

  @Post('documents')
  @Roles('staff', 'admin')
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertKnowledgeDocumentDto) {
    console.log(`[KnowledgeBaseController.upsert] 📄 User ${user.id} (${user.role}) upserting KB document: "${dto.title}" (doc_id: ${dto.document_id}, v: ${dto.version})`);
    const result = await this.kb.upsertDocument({
      title: dto.title,
      document_id: dto.document_id,
      version: dto.version,
      content: dto.content,
      uploaded_by: user.id,
      effective_date: dto.effective_date,
    });
    console.log(`[KnowledgeBaseController.upsert] ✅ Document upserted successfully`);
    return result;
  }

  @Post('search')
  async search(@Body() dto: SearchKnowledgeBaseDto) {
    console.log(`[KnowledgeBaseController.search] 🔍 Searching KB for query: "${dto.query}" (top_k: ${dto.top_k ?? 8})`);
    const chunks = await this.retrieval.search(dto.query, dto.top_k ?? 8);
    console.log(`[KnowledgeBaseController.search] ✅ Retrieved ${chunks.length} chunks`);
    return { chunks };
  }
}
