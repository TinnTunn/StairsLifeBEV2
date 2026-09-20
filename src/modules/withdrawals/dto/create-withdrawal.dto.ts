// DTO pengajuan penarikan dana.

import { IsUUID, IsNumber, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @IsUUID()
  bank_account_id: string;

  @IsNumber()
  @Min(50_000) // WITHDRAWAL_MIN_AMOUNT default
  amount: number;
}
