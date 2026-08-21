import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
      registration_no: student.registration_no,
      roll_no: student.roll_no,
      batch_label: student.batch_label,
      year: student.year,
      semester: student.semester,
      department_id: student.department_id,
      department_name: student.department_name,
      certificate_type: args.certificate_type,
      purpose: args.purpose,
      annual_scheduled_fee: student.annual_scheduled_fee,
      amount_paid: student.amount_paid,
      outstanding_balance: student.outstanding_balance,
      payment_status: student.payment_status,
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

    return {
      ...this.toDto(certificate),
      signed_payload: payload,
    };
  }

  async renderCertificateDocument(certificateId: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        user: true,
        request: true,
      },
    });

    if (!cert) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Certificate not found' });
    }

    const payload = (cert.signedPayload ?? {}) as Record<string, any>;
    const isLoanDoc = cert.certificateType.includes('loan') || cert.purpose.toLowerCase().includes('loan');

    return {
      header: {
        institution: 'Campus Service Copilot University',
        office: 'Office of the Registrar & Academic Affairs',
        serialNumber: cert.serialNumber,
        verificationCode: cert.verificationCode,
        issuedDate: cert.issuedAt.toISOString().slice(0, 10),
      },
      title: isLoanDoc
        ? 'BONAFIDE ENROLLMENT & FEE STRUCTURE CERTIFICATE (FOR EDUCATION LOAN)'
        : 'OFFICIAL BONAFIDE ENROLLMENT CERTIFICATE',
      studentDetails: {
        name: payload.student_name ?? cert.user.name,
        registrationNo: payload.registration_no ?? 'N/A',
        rollNo: payload.roll_no ?? 'N/A',
        department: payload.department_name ?? 'Academic Department',
        batch: payload.batch_label ?? 'N/A',
        currentYear: payload.year ? `${payload.year}nd Year` : 'Enrolled Student',
        semester: payload.semester ?? 'N/A',
      },
      purpose: cert.purpose,
      financialDetails: isLoanDoc
        ? {
            annualScheduledFee: payload.annual_scheduled_fee ?? 0,
            amountPaid: payload.amount_paid ?? 0,
            outstandingBalance: payload.outstanding_balance ?? 0,
            paymentStatus: payload.payment_status ?? 'unpaid',
          }
        : null,
      verificationBlock: {
        signatureHmac: cert.signature,
        issuedBy: cert.issuedBy,
        officialSeal: 'AUTHENTICATED ACADEMIC SEAL',
        verificationUrl: `/verify-certificate?code=${cert.verificationCode}`,
      },
    };
  }

  async getUserCertificates(userId: string) {
    const certs = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
    });
    return certs.map((cert) => ({
      ...this.toDto(cert),
      signed_payload: cert.signedPayload,
    }));
  }

  async verifyCertificateByCode(code: string) {
    const cert = await this.prisma.certificate.findFirst({
      where: {
        OR: [{ verificationCode: code }, { serialNumber: code }],
      },
    });

    if (!cert) {
      throw new NotFoundException({
        code: 'INVALID_VERIFICATION_CODE',
        message: 'No authentic certificate found matching code or serial number',
      });
    }

    const payload = (cert.signedPayload ?? {}) as Record<string, unknown>;
    const expectedSignature = this.sign(payload);
    const isAuthentic = cert.signature === expectedSignature;

    const renderedDoc = await this.renderCertificateDocument(cert.id);

    return {
      verified: isAuthentic,
      serial_number: cert.serialNumber,
      verification_code: cert.verificationCode,
      issued_at: cert.issuedAt,
      document: renderedDoc,
    };
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
