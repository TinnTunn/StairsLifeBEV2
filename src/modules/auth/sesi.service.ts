// Pengelola sesi aktif pengguna.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import * as crypto from 'crypto';

export const TIPE_SESI = 'refresh_session';

@Injectable()
export class SesiService {
  constructor(private prisma: PrismaService) {}

  async buat(args: {
    userId: string;
    ttlMs: number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    const jti = crypto.randomBytes(24).toString('base64url');
    await this.prisma.verification_tokens.create({
      data: {
        user_id: args.userId,
        token_hash: this.hash(jti),
        type: TIPE_SESI,
        expires_at: new Date(Date.now() + args.ttlMs),
        ip_address: args.ipAddress ?? null,
        user_agent: args.userAgent?.slice(0, 255) ?? null,
      },
    });
    return jti;
  }

  async pakai(jti: string, userId: string): Promise<boolean> {
    const res = await this.prisma.verification_tokens.updateMany({
      where: {
        token_hash: this.hash(jti),
        user_id: userId,
        type: TIPE_SESI,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      data: { used_at: new Date() },
    });
    return res.count === 1;
  }

  async cabutSemua(userId: string): Promise<number> {
    const res = await this.prisma.verification_tokens.updateMany({
      where: { user_id: userId, type: TIPE_SESI, used_at: null },
      data: { used_at: new Date() },
    });
    return res.count;
  }

  private hash(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
