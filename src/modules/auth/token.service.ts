// Penerbit dan pemeriksa token akses serta penyegar.

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {
    const access = this.config.get<string>('JWT_SECRET');
    if (!access) {
      throw new Error('JWT_SECRET wajib di-set');
    }
    this.accessSecret = access;

    const refresh = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refresh) {
      console.warn(
        '⚠️  JWT_REFRESH_SECRET belum di-set — fallback ke JWT_SECRET. ' +
          'Untuk produksi, set JWT_REFRESH_SECRET yang BERBEDA dari JWT_SECRET ' +
          'agar token bocor di salah satu lapisan tidak bisa dipakai di lapisan lain.',
      );
    }
    this.refreshSecret = refresh ?? access;

    this.accessExpiresIn = this.config.get<string>('JWT_EXPIRES_IN') ?? '60m';
    this.refreshExpiresIn =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
  }

  signAccess(payload: Record<string, any>): string {
    return this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn as any,
    });
  }

  signRefresh(payload: Record<string, any>): string {
    return this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn as any,
      },
    );
  }

  verifyRefresh(token: string): any {
    return this.jwtService.verify(token, { secret: this.refreshSecret });
  }

  refreshTtlMs(): number {
    return durasiMs(this.refreshExpiresIn);
  }

  signPurpose(payload: Record<string, any>, expiresIn: string): string {
    return this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: expiresIn as any,
    });
  }

  verifyPurpose(token: string): any {
    return this.jwtService.verify(token, { secret: this.refreshSecret });
  }
}

export function durasiMs(nilai: string): number {
  const m = String(nilai)
    .trim()
    .match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const satuan = (m[2] ?? 's').toLowerCase();
  const kali =
    { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[satuan] ?? 1000;
  return n * kali;
}
