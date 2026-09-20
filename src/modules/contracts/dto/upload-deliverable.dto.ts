// DTO pengiriman hasil kerja.

import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ArrayMinSize,
  Min,
  Max,
} from 'class-validator';

export class UploadDeliverableDto {
  @IsOptional()
  @IsString()
  deliverable_url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  deliverable_urls?: string[];

  @IsOptional()
  @IsString()
  deliverable_notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress_pct?: number;
}
