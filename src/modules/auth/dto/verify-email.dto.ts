// DTO verifikasi alamat email.

import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(20, { message: 'Token tidak valid' })
  @MaxLength(200, { message: 'Token tidak valid' })
  token: string;
}
