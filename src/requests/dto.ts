import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  request_type!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  department_id?: string;
}

export class UpdateRequestStatusDto {
  @IsString()
  status!: string;
}
