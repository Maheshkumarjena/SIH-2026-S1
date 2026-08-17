import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class SearchKnowledgeBaseDto {
  @IsString()
  @MinLength(1)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  top_k?: number;
}

export class UpsertKnowledgeDocumentDto {
  @IsString()
  title!: string;

  @IsString()
  document_id!: string;

  @IsString()
  version!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  effective_date?: string;

  @IsOptional()
  @IsString()
  owning_department?: string;
}
