import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { HashChainService } from './hash-chain.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, HashChainService],
  exports: [AuditService, HashChainService],
})
export class AuditModule {}
