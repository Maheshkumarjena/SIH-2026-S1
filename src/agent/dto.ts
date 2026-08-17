import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SupportedLanguage } from '../common/types';

export class StartAgentSessionDto {
  @IsOptional()
  @IsIn(['en', 'hi', 'or'])
  language?: SupportedLanguage;
}

export class PostAgentMessageDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
