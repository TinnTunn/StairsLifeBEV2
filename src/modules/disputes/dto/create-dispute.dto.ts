// DTO pengajuan sengketa.

import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
} from 'class-validator';

export class CreateDisputeDto {
  @IsUUID()
  contract_id: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(20, { message: 'Reason minimal 20 karakter' })
  reason: string;

  @IsOptional()
  @IsString()
  evidence_url?: string;
}
