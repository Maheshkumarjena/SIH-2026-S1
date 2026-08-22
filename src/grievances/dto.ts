import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class FileGrievanceDto {
  @IsString()
  category!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;

  @IsOptional()
  @IsString()
  exam_record_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence_urls?: string[];
}
