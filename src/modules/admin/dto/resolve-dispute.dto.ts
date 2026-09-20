// DTO putusan sengketa oleh admin.

import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum DisputeStatus {
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

export enum DisputeOutcome {
  FAVOR_BUSINESS = 'favor_business',
  FAVOR_STUDENT = 'favor_student',
  SPLIT = 'split',
  NO_ACTION = 'no_action',
}

export class ResolveDisputeDto {
  @IsEnum(DisputeStatus, {
    message: 'status harus: under_review | resolved | rejected',
  })
  status: DisputeStatus;

  @IsOptional()
  @IsEnum(DisputeOutcome, {
    message:
      'outcome harus: favor_business | favor_student | split | no_action',
  })
  outcome?: DisputeOutcome;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  student_share_percent?: number;

  @IsOptional()
  @IsString()
  admin_notes?: string;
}
