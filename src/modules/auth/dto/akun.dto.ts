// DTO perubahan data akun.

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GantiPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  current_password?: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @MaxLength(128, { message: 'Password maksimal 128 karakter' })
  new_password: string;
}

export class GantiEmailDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  @MaxLength(255)
  new_email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class KonfirmasiEmailDto {
  @IsString()
  @MinLength(20, { message: 'Token tidak valid' })
  @MaxLength(2000, { message: 'Token tidak valid' })
  token: string;
}

export class HapusAkunDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
