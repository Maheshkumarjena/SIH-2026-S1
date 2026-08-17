import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { MockJwtAuthGuard } from '../src/common/guards/mock-jwt-auth.guard';

describe('MockJwtAuthGuard role metadata', () => {
  it('blocks authenticated users whose role is not allowed', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) } as unknown as Reflector;
    const guard = new MockJwtAuthGuard({ get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService, reflector);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-user-id': '22222222-2222-4222-8222-222222222222',
            'x-user-role': 'student',
            'x-department-id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
