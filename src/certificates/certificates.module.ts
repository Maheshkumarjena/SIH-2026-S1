import { Module } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { StudentVerificationService } from './student-verification.service';

@Module({
  providers: [CertificateService, StudentVerificationService],
  exports: [CertificateService, StudentVerificationService],
})
export class CertificatesModule {}
