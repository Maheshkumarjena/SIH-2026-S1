import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Role, SupportedLanguage } from '../common/types';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['student', 'staff', 'admin', 'warden', 'lab_incharge'])
  role!: Role;

  @IsString()
  department_id!: string;

  @IsOptional()
  @IsIn(['en', 'hi', 'or'])
  preferred_language?: SupportedLanguage;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refresh_token?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refresh_token?: string;

  @IsOptional()
  all_devices?: boolean;
}

export class UpdateMeDto {
  @IsOptional()
  @IsIn(['en', 'hi', 'or'])
  preferred_language?: SupportedLanguage;

  @IsOptional()
  notification_prefs?: Record<string, unknown>;
}
