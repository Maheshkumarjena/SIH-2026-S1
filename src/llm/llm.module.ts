import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LlmGateway } from './llm.gateway';

@Module({
  imports: [AuditModule],
  providers: [LlmGateway],
  exports: [LlmGateway],
})
export class LlmModule {}
