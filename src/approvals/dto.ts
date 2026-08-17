import { IsString, MinLength } from 'class-validator';

export class RejectApprovalDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}

export class RequestInfoDto {
  @IsString()
  @MinLength(1)
  question!: string;
}
