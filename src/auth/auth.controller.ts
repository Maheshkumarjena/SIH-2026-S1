import { Body, Controller, Get, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UpdateMeDto } from './dto';

interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.register(dto);
    this.setAccessCookie(response, result.access_token);
    return { user: result.user, access_token: result.access_token };
  }

  @Post('auth/login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.login(dto);
    this.setAccessCookie(response, result.access_token);
    return { user: result.user, access_token: result.access_token };
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
}
