// DTO permintaan tautan atur ulang kata sandi.

import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}
