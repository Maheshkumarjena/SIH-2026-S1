import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { PasswordService } from '../src/auth/password.service';

describe('AuthService refresh tokens', () => {
  it('rotates refresh tokens and rejects reused tokens', async () => {
    const refreshTokens: Array<Record<string, unknown>> = [];
    const user = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Test Student',
      email: 'student@soa.demo',
      passwordHash: 'hash',
      role: 'student',
      departmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      preferredLanguage: 'en',
      notificationPrefs: {},
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
      refreshToken: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `rt-${refreshTokens.length + 1}`, ...data, revokedAt: null };
          refreshTokens.push(row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }) => {
          const row = refreshTokens.find((item) => item.tokenHash === where.tokenHash);
          return row ? { ...row, user } : null;
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = refreshTokens.find((item) => item.id === where.id);
          Object.assign(row ?? {}, data);
          return row;
        }),
      },
    };
    const jwt = new JwtService({ secret: 'test-secret' });
    const service = new AuthService(prisma as never, jwt, { verify: jest.fn().mockResolvedValue(true) } as unknown as PasswordService);

    const login = await service.login({ email: user.email, password: 'Password123!' });
    const refreshed = await service.refresh(login.refresh_token);

    expect(refreshed.refresh_token).not.toBe(login.refresh_token);
    await expect(service.refresh(login.refresh_token)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
    });
  });
});
