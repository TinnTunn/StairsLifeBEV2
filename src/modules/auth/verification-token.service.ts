// Penerbit token verifikasi email dan atur ulang kata sandi.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import * as crypto from 'crypto';

const TOKEN_BYTES = 32;
const TTL_EMAIL_VERIFICATION_MS = 24 * 60 * 60 * 1000; // 24 jam
const TTL_PASSWORD_RESET_MS = 60 * 60 * 1000; // 1 jam

export type TokenType =
  | 'email_verification'
  | 'password_reset'
  | 'email_change';

@Injectable()
export class VerificationTokenService {
  constructor(private prisma: PrismaService) {}

  async create(args: {
    userId: string;
    type: TokenType;
    ipAddress?: string;
    userAgent?: string;
    rawToken?: string;
    ttlMs?: number;
  }): Promise<{ rawToken: string; expiresAt: Date }> {
    await this.prisma.verification_tokens.updateMany({
      where: {
        user_id: args.userId,
        type: args.type,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      data: { used_at: new Date() },
    });

    const rawToken = args.rawToken ?? this._generateToken();
    const tokenHash = this._hashToken(rawToken);
    const ttl =
      args.ttlMs ??
      (args.type === 'email_verification'
        ? TTL_EMAIL_VERIFICATION_MS
        : TTL_PASSWORD_RESET_MS);
    const expiresAt = new Date(Date.now() + ttl);

    await this.prisma.verification_tokens.create({
      data: {
        user_id: args.userId,
        token_hash: tokenHash,
        type: args.type,
        expires_at: expiresAt,
        ip_address: args.ipAddress ?? null,
        user_agent: args.userAgent ?? null,
      },
    });

    return { rawToken, expiresAt };
  }

  async consume(args: {
    rawToken: string;
    type: TokenType;
  }): Promise<{ userId: string } | null> {
    if (!args.rawToken || args.rawToken.length < 10) return null;
    const tokenHash = this._hashToken(args.rawToken);

    const row = await this.prisma.verification_tokens.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!row) return null;
    if (row.type !== args.type) return null;
    if (row.used_at) return null;
    if (row.expires_at < new Date()) return null;

    const updated = await this.prisma.verification_tokens.updateMany({
      where: {
        token_hash: tokenHash,
        used_at: null,
      },
      data: { used_at: new Date() },
    });

    if (updated.count === 0) return null;

    return { userId: row.user_id };
  }

  async cleanup(): Promise<number> {
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.verification_tokens.deleteMany({
      where: {
        OR: [
          { expires_at: { lt: threshold } },
          { used_at: { not: null, lt: threshold } as any },
        ],
      },
    });
    return result.count;
  }

  private _generateToken(): string {
    return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  }

  private _hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
