import { RiskClassificationService } from '../src/agent/risk/risk-classification.service';

describe('RiskClassificationService', () => {
  const prisma = {
    requestType: {
      findUnique: jest.fn(),
    },
  };
  const service = new RiskClassificationService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('classifies low-risk actions from request type defaults', async () => {
    prisma.requestType.findUnique.mockResolvedValue({ defaultRiskLevel: 'low' });
    await expect(
      service.classify(
        {
          step_name: 'Create request',
          tool_name: 'create_request',
          tool_args: { request_type: 'maintenance', description: 'AC issue' },
          rationale: 'Tracking',
        },
        'maintenance',
      ),
    ).resolves.toMatchObject({ risk_level: 'low' });
  });

  it('never downgrades certificate issuance below high', async () => {
    prisma.requestType.findUnique.mockResolvedValue({ defaultRiskLevel: 'low' });
    await expect(
      service.classify({
        step_name: 'Issue certificate',
        tool_name: 'issue_certificate',
        tool_args: { request_id: 'r1', certificate_type: 'bonafide', purpose: 'scholarship' },
        rationale: 'Final issuance',
      }),
    ).resolves.toMatchObject({ risk_level: 'high' });
  });
});
