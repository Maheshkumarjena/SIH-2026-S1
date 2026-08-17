import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ROLES_KEY } from '../roles.decorator';
import { AuthenticatedUser, Role, SupportedLanguage } from '../types';

@Injectable()
export class MockJwtAuthGuard implements CanActivate {
  private readonly jwt: JwtService;

  constructor(
    config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.jwt = new JwtService({ secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me' });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      cookies?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    const token = this.extractToken(request.headers, request.cookies);
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{
          sub: string;
          role: Role;
          department_id: string;
          preferred_language?: SupportedLanguage;
        }>(token);
        request.user = {
          id: payload.sub,
          role: payload.role,
          department_id: payload.department_id,
          preferred_language: payload.preferred_language ?? 'en',
        };
        this.assertRoleAllowed(context, request.user);
        return true;
      } catch {
        throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid or expired access token' });
      }
    }

    const userId = request.headers['x-user-id'];
    const role = request.headers['x-user-role'] as Role | undefined;
    const departmentId = request.headers['x-department-id'];
    const language = request.headers['x-preferred-language'] as SupportedLanguage | undefined;

    if (!userId || !role || !departmentId) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing authenticated user context' });
    }

    request.user = {
      id: userId,
      role,
      department_id: departmentId,
      preferred_language: language ?? 'en',
    };
    this.assertRoleAllowed(context, request.user);
    return true;
  }

  private assertRoleAllowed(context: ExecutionContext, user: AuthenticatedUser): void {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Role is not allowed for this route' });
    }
  }

  private extractToken(headers: Record<string, string | undefined>, cookies?: Record<string, string | undefined>): string | null {
    const authorization = headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }
    if (cookies?.access_token) {
      return cookies.access_token;
    }
    const rawCookie = headers.cookie;
    if (rawCookie) {
      const token = rawCookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('access_token='))
        ?.slice('access_token='.length);
      if (token) {
        return decodeURIComponent(token);
      }
    }
    return null;
  }
}
