import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StudentVerificationService } from './student-verification.service';

@Injectable()
export class CertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: StudentVerificationService,
    private readonly config: ConfigService,
  ) {}

  async issue(args: { request_id: string; certificate_type: string; purpose: string; issued_by: string }) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: args.request_id },
      include: { user: true, requestType: true },
    });
    if (!request) {
      throw new BadRequestException({ code: 'REQUEST_NOT_FOUND', message: 'Certificate request not found' });
    }
    const student = await this.verification.verifyForCertificate(request.userId);
    const existing = await this.prisma.certificate.findFirst({ where: { requestId: request.id } });
    if (existing) {
      return this.toDto(existing);
    }

    const issuedAt = new Date();
    const payload = {
      request_id: request.id,
      user_id: request.userId,
      student_name: student.name,
      department_id: student.department_id,
      certificate_type: args.certificate_type,
      purpose: args.purpose,
      issued_at: issuedAt.toISOString(),
    };
    const signature = this.sign(payload);
    const certificate = await this.prisma.certificate.create({
      data: {
        requestId: request.id,
        userId: request.userId,
        certificateType: args.certificate_type,
        purpose: args.purpose,
        serialNumber: this.serialNumber(issuedAt),
        verificationCode: randomBytes(12).toString('hex').toUpperCase(),
        signedPayload: payload as Prisma.InputJsonValue,
        signature,
        issuedBy: args.issued_by,
        issuedAt,
      },
    });
    await this.prisma.serviceRequest.update({
      where: { id: request.id },
      data: { status: 'completed', resolvedAt: issuedAt },
    });
    return this.toDto(certificate);
  }

  private sign(payload: Record<string, unknown>): string {
    const secret = this.config.get<string>('CERTIFICATE_SIGNING_SECRET') ?? this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me';
    return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  }

  private serialNumber(date: Date): string {
    const year = date.getUTCFullYear();
    return `SOA-CERT-${year}-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private toDto(certificate: {
    id: string;
    requestId: string;
    userId: string;
    certificateType: string;
    purpose: string;
    serialNumber: string;
    verificationCode: string;
    signature: string;
    issuedAt: Date;
  }) {
    return {
      id: certificate.id,
      request_id: certificate.requestId,
      user_id: certificate.userId,
      certificate_type: certificate.certificateType,
      purpose: certificate.purpose,
      serial_number: certificate.serialNumber,
      verification_code: certificate.verificationCode,
      signature: certificate.signature,
      issued_at: certificate.issuedAt,
    };
  }
}
