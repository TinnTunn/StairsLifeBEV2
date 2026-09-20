// Logika pengaturan platform seperti komisi dan batas penarikan.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const DEFAULT_PLATFORM_FEE_PERCENT = 5;
const CACHE_TTL_MS = 60_000;

export interface PengaturanPublik {
  platform_fee: number;
  withdrawal_min_amount: number;
  withdrawal_admin_fee: number;
  verification_sla_days: number;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: { value: PengaturanPublik; expiresAt: number } | null = null;

  constructor(private prisma: PrismaService) {}

  async publik(): Promise<PengaturanPublik> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;

    let platformFee = DEFAULT_PLATFORM_FEE_PERCENT;
    let slaDays = 2;
    try {
      const rows = await this.prisma.platform_settings.findMany({
        where: { key: { in: ['platform_fee', 'verification_sla_days'] } },
      });
      for (const row of rows) {
        const n = Number(row.value);
        if (Number.isNaN(n)) continue;
        if (row.key === 'platform_fee')
          platformFee = Math.max(0, Math.min(50, n));
        if (row.key === 'verification_sla_days') slaDays = n;
      }
    } catch (e) {
      this.logger.warn(
        `gagal baca platform_settings, pakai default: ${(e as Error).message}`,
      );
    }

    const value: PengaturanPublik = {
      platform_fee: platformFee,
      withdrawal_min_amount: Number(
        process.env.WITHDRAWAL_MIN_AMOUNT ?? 50_000,
      ),
      withdrawal_admin_fee: Number(process.env.WITHDRAWAL_ADMIN_FEE ?? 2500),
      verification_sla_days: slaDays,
    };
    this.cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  }

  invalidate(): void {
    this.cache = null;
  }
}
