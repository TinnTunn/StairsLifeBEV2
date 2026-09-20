// DTO banding akun yang ditangguhkan.

import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class SuspendedAppealDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(5, { message: 'Pesan minimal 5 karakter' })
  @MaxLength(1000, { message: 'Pesan maksimal 1000 karakter' })
  message: string;
}
