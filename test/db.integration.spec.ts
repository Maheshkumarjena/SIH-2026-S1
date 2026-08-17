import { PrismaClient, RiskLevel, RoleName } from '@prisma/client';
import { createHash } from 'crypto';

const describeDb = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeDb('database integration', () => {
  const prisma = new PrismaClient();
  const suffix = Date.now().toString();
  const userId = '66666666-6666-4666-8666-666666666666';
  const requestTypeName = `integration_certificate_${suffix}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.serviceRequest.deleteMany({ where: { userId } });
    await prisma.requestType.deleteMany({ where: { name: requestTypeName } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('persists refresh tokens and signed certificates', async () => {
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: 'Integration Student',
        email: `integration-${suffix}@soa.demo`,
        passwordHash: 'test',
        role: RoleName.student,
        departmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(`refresh-${suffix}`).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const requestType = await prisma.requestType.create({
      data: { name: requestTypeName, defaultRiskLevel: RiskLevel.high, defaultSlaHours: 72 },
    });
    const request = await prisma.serviceRequest.create({
      data: {
        userId: user.id,
        requestTypeId: requestType.id,
        departmentId: user.departmentId,
        description: 'Integration certificate request',
        slaDueAt: new Date(Date.now() + 60_000),
      },
    });
    const certificate = await prisma.certificate.create({
      data: {
        requestId: request.id,
        userId: user.id,
        certificateType: 'bonafide',
        purpose: 'scholarship',
        serialNumber: `INT-${suffix}`,
        verificationCode: `VERIFY-${suffix}`,
        signedPayload: { request_id: request.id },
        signature: createHash('sha256').update(request.id).digest('hex'),
        issuedBy: user.id,
      },
    });

    expect(certificate.requestId).toBe(request.id);
  });
});
