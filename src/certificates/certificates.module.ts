import { Module } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { CertificatesController } from './certificates.controller';
import { StudentVerificationService } from './student-verification.service';

@Module({
  controllers: [CertificatesController],
  providers: [CertificateService, StudentVerificationService],
  exports: [CertificateService, StudentVerificationService],
})
export class CertificatesModule {}
