import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  async register(dto: RegisterDto) {
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
    return { user: this.toDto(user), access_token: await this.sign(this.toAuthUser(user)) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await this.passwords.verify(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }
    return { user: this.toDto(user), access_token: await this.sign(this.toAuthUser(user)) };
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
  }) {
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
