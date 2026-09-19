import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RejectDeliverableDto {
  // Frontend mengirim field `reason` (bukan `rejection_reason`) — DTO
  // disesuaikan supaya match. Service menerima body apa adanya dan
  // mengakses property `reason` untuk membaca nilai.
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Alasan penolakan maksimal 1000 karakter' })
  reason?: string;

  /** Hasil kerja yang dilihat klien saat menolak. Lihat ReviewDeliverableDto. */
  @IsOptional()
  @IsUUID()
  deliverable_id?: string;
}

/**
 * Body opsional untuk approve. Bila dikirim, backend memastikan hasil kerja
 * yang menunggu review masih yang sama dengan yang dilihat klien, jadi layar
 * yang basi tidak menyetujui kiriman lain.
 */
export class ReviewDeliverableDto {
  @IsOptional()
  @IsUUID()
  deliverable_id?: string;
}
