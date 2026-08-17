import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class FileGrievanceDto {
  @IsString()
  category!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsBoolean()
  anonymous!: boolean;

  @IsOptional()
  evidence_urls?: string[];
}
