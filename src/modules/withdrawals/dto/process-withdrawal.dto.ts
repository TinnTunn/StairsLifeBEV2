// DTO pemrosesan penarikan oleh admin.

import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class ProcessWithdrawalDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  use_xendit?: boolean;
}
