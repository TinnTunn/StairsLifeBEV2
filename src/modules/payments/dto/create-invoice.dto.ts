// DTO pembuatan invoice Xendit.

import { IsUUID, IsInt, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  contract_id: string;

  @IsInt() // wajib bilangan bulat — kolom payments.amount = Int, fee/net dihitung dari sini
  @Min(10_000) // minimum Rp 10.000 (Xendit hard min Rp 1.500 untuk QRIS, kita pakai 10k untuk safety)
  @Max(100_000_000) // selaras dgn cap FE; jauh di bawah ceiling Int (~Rp 2,1 M)
  amount: number;

  @IsOptional()
  @IsNumber()
  @Min(900) // minimal 15 menit
  invoice_duration?: number;
}
