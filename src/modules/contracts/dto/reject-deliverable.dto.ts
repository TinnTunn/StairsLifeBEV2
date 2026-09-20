// DTO penolakan hasil kerja.

import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RejectDeliverableDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Alasan penolakan maksimal 1000 karakter' })
  reason?: string;

  @IsOptional()
  @IsUUID()
  deliverable_id?: string;
}

export class ReviewDeliverableDto {
  @IsOptional()
  @IsUUID()
  deliverable_id?: string;
}
