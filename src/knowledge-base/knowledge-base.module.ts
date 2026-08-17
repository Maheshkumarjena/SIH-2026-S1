import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [LlmModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, RetrievalService],
  exports: [KnowledgeBaseService, RetrievalService],
})
export class KnowledgeBaseModule {}
