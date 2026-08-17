import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuthenticatedUser, Role, SupportedLanguage } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto, UpdateMeDto } from './dto';
import { PasswordService } from './password.service';

interface TokenPayload {
  sub: string;
  role: Role;
  department_id: string;
  preferred_language: SupportedLanguage;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: string;
  preferred_language: string;
  notification_prefs: unknown;
}

export interface AuthResult {
  user: UserDto;
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email is already registered' });
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: await this.passwords.hash(dto.password),
        role: dto.role,
        departmentId: dto.department_id,
        preferredLanguage: dto.preferred_language ?? 'en',
      },
    });
    return this.issueAuthResult(this.toAuthUser(user), this.toDto(user));
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await this.passwords.verify(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }
    return this.issueAuthResult(this.toAuthUser(user), this.toDto(user));
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' });
    }

    const authUser = this.toAuthUser(stored.user);
    const dto = this.toDto(stored.user);
    const nextRefreshToken = await this.createRefreshToken(authUser.id);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: nextRefreshToken.id },
    });
    return {
      user: dto,
      access_token: await this.sign(authUser),
      refresh_token: nextRefreshToken.token,
    };
  }

  async logout(user: AuthenticatedUser | null, refreshToken?: string, allDevices = false): Promise<{ logged_out: true }> {
    if (allDevices && user) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { logged_out: true };
    }
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashRefreshToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { logged_out: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toDto(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferredLanguage: dto.preferred_language,
        notificationPrefs: dto.notification_prefs as Prisma.InputJsonValue | undefined,
      },
    });
    return this.toDto(user);
  }

  async sign(user: AuthenticatedUser): Promise<string> {
    const payload: TokenPayload = {
      sub: user.id,
      role: user.role,
      department_id: user.department_id,
      preferred_language: user.preferred_language,
    };
    return this.jwt.signAsync(payload);
  }

  private async issueAuthResult(authUser: AuthenticatedUser, dto: UserDto): Promise<AuthResult> {
    const refreshToken = await this.createRefreshToken(authUser.id);
    return {
      user: dto,
      access_token: await this.sign(authUser),
      refresh_token: refreshToken.token,
    };
  }

  private async createRefreshToken(userId: string): Promise<{ id: string; token: string }> {
    const token = randomBytes(48).toString('base64url');
    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashRefreshToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { id: created.id, token };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthUser(user: { id: string; role: string; departmentId: string; preferredLanguage: string }): AuthenticatedUser {
    return {
      id: user.id,
      role: user.role as Role,
      department_id: user.departmentId,
      preferred_language: user.preferredLanguage as SupportedLanguage,
    };
  }

  private toDto(user: {
    id: string;
    name: string;
    email: string;
    role: string;
    departmentId: string;
    preferredLanguage: string;
    notificationPrefs: unknown;
  }): UserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.departmentId,
      preferred_language: user.preferredLanguage,
      notification_prefs: user.notificationPrefs,
    };
  }
}
