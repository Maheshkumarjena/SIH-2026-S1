import { IsDateString, IsOptional, IsString } from 'class-validator';

export class BookLabSlotDto {
  @IsString()
  resource_id!: string;

  @IsDateString()
  start_time!: string;

  @IsDateString()
  end_time!: string;

  @IsOptional()
  @IsString()
  course_code?: string;

  @IsOptional()
  @IsString()
  faculty_ref?: string;
}
