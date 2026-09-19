import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { JwtUser } from '../../common/types/jwt-payload.type';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AkunService } from './akun.service';
import {
  GantiEmailDto,
  GantiPasswordDto,
  HapusAkunDto,
  KonfirmasiEmailDto,
} from './dto/akun.dto';

/** Keamanan akun. Throttle ketat karena setiap endpoint memeriksa kata sandi. */
@Controller('account')
export class AkunController {
  constructor(private readonly akun: AkunService) {}

  // PATCH /api/v1/account/password
  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { ttl: 60_000, limit: 5 }, medium: { ttl: 60_000, limit: 5 } })
  gantiPassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: GantiPasswordDto,
    @Req() req: Request,
  ) {
    return this.akun.gantiPassword(user.id, dto.current_password, dto.new_password, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  // POST /api/v1/account/email
  @Post('email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { ttl: 60_000, limit: 3 }, medium: { ttl: 60_000, limit: 3 } })
  mintaGantiEmail(@CurrentUser() user: JwtUser, @Body() dto: GantiEmailDto) {
    return this.akun.mintaGantiEmail(user.id, dto.new_email, dto.password);
  }

  // POST /api/v1/account/email/confirm — publik, token dari email
  @Post('email/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60_000, limit: 10 }, medium: { ttl: 60_000, limit: 10 } })
  konfirmasiEmail(@Body() dto: KonfirmasiEmailDto) {
    return this.akun.konfirmasiGantiEmail(dto.token);
  }

  // POST /api/v1/account/delete
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { ttl: 60_000, limit: 3 }, medium: { ttl: 60_000, limit: 3 } })
  hapus(@CurrentUser() user: JwtUser, @Body() dto: HapusAkunDto) {
    return this.akun.hapusAkun(user.id, dto.password, dto.reason);
  }
}
