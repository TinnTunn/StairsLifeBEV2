// DTO pembuatan pembayaran.

import { IsUUID, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  contract_id: string;

  @IsInt()
  @Min(10_000) // tolak 0/negatif — escrow manual harus nominal nyata
  amount: number;

  @IsOptional()
  @IsString()
  proof_url?: string;
}
