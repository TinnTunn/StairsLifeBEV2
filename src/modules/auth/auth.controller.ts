// Endpoint autentikasi: daftar, masuk, dan pemulihan kata sandi.

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  ResetPasswordDto,
  ResendVerificationDto,
} from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SuspendedAppealDto } from './dto/suspended-appeal.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({
    short: { ttl: 60_000, limit: 5 },
    medium: { ttl: 60_000, limit: 5 },
  })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { ttl: 60_000, limit: 10 },
    medium: { ttl: 60_000, limit: 10 },
  })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  async refresh(@Body() body: { refresh_token?: string }, @Req() req: Request) {
    return this.authService.refresh(body.refresh_token, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async logout(@Body() body: { refresh_token?: string }) {
    return this.authService.logout(body?.refresh_token);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { ttl: 60_000, limit: 10 },
    medium: { ttl: 60_000, limit: 10 },
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
  })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() req: Request,
  ) {
    return this.authService.resendVerification(dto.email, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto.email, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { ttl: 60_000, limit: 5 },
    medium: { ttl: 60_000, limit: 5 },
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.new_password);
  }

  @Post('suspended-appeal')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
  })
  async suspendedAppeal(@Body() dto: SuspendedAppealDto) {
    return this.authService.submitSuspensionAppeal(dto.email, dto.message);
  }
}
