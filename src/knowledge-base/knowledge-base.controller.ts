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
  list() {
    return this.kb.list();
  }

  @Post('documents')
  @Roles('staff', 'admin')
  upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertKnowledgeDocumentDto) {
    return this.kb.upsertDocument({
      title: dto.title,
      document_id: dto.document_id,
      version: dto.version,
      content: dto.content,
      uploaded_by: user.id,
      effective_date: dto.effective_date,
    });
  }

  @Post('search')
  async search(@Body() dto: SearchKnowledgeBaseDto) {
    const chunks = await this.retrieval.search(dto.query, dto.top_k ?? 8);
    return { chunks };
  }
}
