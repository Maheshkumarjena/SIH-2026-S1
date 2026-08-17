import { Body, Controller, Get, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto, UpdateMeDto } from './dto';

interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

interface CookieRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.register(dto);
    this.setAccessCookie(response, result.access_token);
    this.setRefreshCookie(response, result.refresh_token);
    return result;
  }

  @Post('auth/login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.login(dto);
    this.setAccessCookie(response, result.access_token);
    this.setRefreshCookie(response, result.refresh_token);
    return result;
  }

  @Post('auth/refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.refresh(dto.refresh_token ?? this.extractCookie(request, 'refresh_token') ?? '');
    this.setAccessCookie(response, result.access_token);
    this.setRefreshCookie(response, result.refresh_token);
    return result;
  }

  @Post('auth/logout')
  async logout(
    @Body() dto: LogoutDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const user = await this.optionalUser(request);
    const result = await this.auth.logout(user, dto.refresh_token ?? this.extractCookie(request, 'refresh_token') ?? undefined, dto.all_devices);
    this.clearAuthCookies(response);
    return result;
  }

  @UseGuards(MockJwtAuthGuard)
  @Get('users/me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getMe(user.id);
  }

  @UseGuards(MockJwtAuthGuard)
  @Patch('users/me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(user.id, dto);
  }

  private setAccessCookie(response: CookieResponse, token: string): void {
    response.cookie('access_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000,
    });
  }

  private setRefreshCookie(response: CookieResponse, token: string): void {
    response.cookie('refresh_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(response: CookieResponse): void {
    const options = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    };
    response.clearCookie('access_token', options);
    response.clearCookie('refresh_token', options);
  }

  private extractCookie(request: CookieRequest, name: string): string | null {
    const direct = request.cookies?.[name];
    if (direct) {
      return direct;
    }
    return (
      request.headers.cookie
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? null
    );
  }

  private async optionalUser(request: CookieRequest): Promise<AuthenticatedUser | null> {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : this.extractCookie(request, 'access_token');
    if (!token) {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
        sub: string;
        role: AuthenticatedUser['role'];
        department_id: string;
        preferred_language?: AuthenticatedUser['preferred_language'];
      };
      return {
        id: payload.sub,
        role: payload.role,
        department_id: payload.department_id,
        preferred_language: payload.preferred_language ?? 'en',
      };
    } catch {
      return null;
    }
  }
}
