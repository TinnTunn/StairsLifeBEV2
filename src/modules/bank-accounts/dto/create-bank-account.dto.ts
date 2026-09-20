// DTO pendaftaran rekening bank.

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  bank_name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]{2,20}$/, {
    message:
      'bank_code harus huruf besar, angka, atau underscore (mis. "BCA", "MANDIRI")',
  })
  bank_code: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9-]+$/, {
    message: 'account_number hanya boleh angka dan dash',
  })
  @Length(6, 30)
  account_number: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  account_holder: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
