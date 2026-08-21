import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { CertificateService } from './certificate.service';

@Controller('certificates')
@UseGuards(MockJwtAuthGuard)
export class CertificatesController {
  constructor(private readonly certificates: CertificateService) {}

  @Get('my')
  async getMyCertificates(@CurrentUser() user: AuthenticatedUser) {
    return this.certificates.getUserCertificates(user.id);
  }

  @Get('verify/:code')
  async verifyCertificate(@Param('code') code: string) {
    return this.certificates.verifyCertificateByCode(code);
  }

  @Get(':id/render')
  async renderCertificate(@Param('id') id: string) {
    return this.certificates.renderCertificateDocument(id);
  }
}
