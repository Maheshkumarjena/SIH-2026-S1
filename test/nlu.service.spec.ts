import { NluService } from '../src/agent/nlu.service';

describe('NluService fallback', () => {
  const llm = { call: jest.fn().mockRejectedValue(new Error('offline')) };
  const service = new NluService(llm as never);

  it('detects English certificate requests', async () => {
    await expect(service.detectLanguage('I need a bonafide certificate', 's1')).resolves.toBe('en');
    await expect(service.classifyAndExtract('I need a bonafide certificate for scholarship', 's1')).resolves.toMatchObject({
      intent: 'certificate_request',
      entities: { certificate_type: 'bonafide', purpose: 'scholarship' },
    });
  });

  it('detects Hindi script', async () => {
    await expect(service.detectLanguage('मुझे प्रमाणपत्र चाहिए', 's1')).resolves.toBe('hi');
  });

  it('detects Odia script', async () => {
    await expect(service.detectLanguage('ମୋତେ ସର୍ଟିଫିକେଟ ଦରକାର', 's1')).resolves.toBe('or');
  });
});
