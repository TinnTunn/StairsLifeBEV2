// Logika autentikasi dan pendaftaran akun.

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { PrismaService } from '../../config/prisma.service';
import { TokenService } from './token.service';
import { SesiService } from './sesi.service';
import { VerificationTokenService } from './verification-token.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const ALLOWED_REGISTER_ROLES = ['mahasiswa', 'bisnis'] as const;

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private static readonly DUMMY_PASSWORD_HASH =
    '$2b$12$xC/GOQFhxdafImNAcsj3deScfjdjgLoexlKOyAkshKVSV6U3T6yti';

  constructor(
    private supabaseService: SupabaseService,
    private prisma: PrismaService,
    private tokenService: TokenService,
    private verificationToken: VerificationTokenService,
    private emailService: EmailService,
    private sesi: SesiService,
  ) {}

  async register(dto: RegisterDto, ctx?: RequestContext) {
    const supabase = this.supabaseService.getClient();

    if (!ALLOWED_REGISTER_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        'Role tidak valid. Hanya mahasiswa atau bisnis yang bisa daftar.',
      );
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', dto.email)
      .single();

    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        full_name: dto.full_name,
        email: dto.email,
        password_hash: hashedPassword,
        role: dto.role,
        tier: 'pemula',
        is_verified: dto.role === 'bisnis' ? true : false,
        email_verified_at: null, // email verification belum
        university: dto.university ?? null,
        major: dto.major ?? null,
        semester: dto.semester ?? null,
        phone: dto.phone ?? null,
        company_name: dto.company_name ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(
        'id, full_name, email, role, tier, is_verified, university, major, semester, phone, company_name',
      )
      .single();

    if (error) {
      if (
        (error as any).code === '23505' ||
        /duplicate|unique|already exists/i.test(error.message || '')
      ) {
        throw new ConflictException('Email sudah terdaftar');
      }
      throw new BadRequestException('Pendaftaran gagal. Silakan coba lagi.');
    }

    void this._sendVerificationEmail(user.id, user.email, user.full_name, ctx);

    const tokens = await this.buatPasanganToken(user, ctx);

    return {
      data: {
        user: { ...user, email_verified: false },
        ...tokens,
      },
      message:
        'Pendaftaran berhasil. Cek email kamu untuk verifikasi (jangan lupa folder spam).',
    };
  }

  async login(dto: LoginDto, ctx?: RequestContext) {
    const supabase = this.supabaseService.getClient();

    const { data: user } = await supabase
      .from('users')
      .select(
        'id, full_name, email, role, tier, is_verified, is_suspended, suspension_reason, email_verified_at, password_hash',
      )
      .eq('email', dto.email)
      .single();

    const hashToCheck = user?.password_hash || AuthService.DUMMY_PASSWORD_HASH;
    const isPasswordValid = await bcrypt.compare(dto.password, hashToCheck);

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (!user.password_hash) {
      throw new UnauthorizedException(
        'Akun ini belum memiliki password. Silakan atur password melalui fitur "Lupa password".',
      );
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (user.is_suspended) {
      throw new UnauthorizedException(
        JSON.stringify({
          suspended: true,
          reason:
            user.suspension_reason ||
            'Melanggar ketentuan penggunaan platform.',
        }),
      );
    }

    const {
      password_hash: _password_hash,
      email_verified_at,
      ...userWithoutPassword
    } = user;
    const userPayload = {
      ...userWithoutPassword,
      email_verified: !!email_verified_at,
    };
    const tokens = await this.buatPasanganToken(userPayload, ctx);

    return {
      data: { user: userPayload, ...tokens },
      message: 'Login berhasil',
    };
  }

  async submitSuspensionAppeal(email: string, message: string) {
    const supabase = this.supabaseService.getClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, role, is_suspended')
      .eq('email', email)
      .single();

    if (user && user.is_suspended) {
      await supabase.from('support_messages').insert({
        room_id: `support-${user.id}`,
        sender_id: user.id,
        content: message,
        sender_role: user.role,
        created_at: new Date().toISOString(),
      });
    }

    return {
      data: null,
      message:
        'Pesan kamu sudah dikirim ke tim admin. Kami akan meninjau dan menghubungi kamu secepatnya.',
    };
  }

  async verifyEmail(rawToken: string) {
    const result = await this.verificationToken.consume({
      rawToken,
      type: 'email_verification',
    });

    if (!result) {
      throw new BadRequestException(
        'Link verifikasi tidak valid atau sudah kedaluwarsa. Minta link baru di halaman login.',
      );
    }

    const supabase = this.supabaseService.getClient();
    const { data: user } = await supabase
      .from('users')
      .update({
        email_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', result.userId)
      .select('id, full_name, email, role')
      .single();

    if (!user) {
      throw new BadRequestException('User tidak ditemukan');
    }

    void this.emailService.sendWelcomeEmail({
      to: user.email,
      fullName: user.full_name,
      role: user.role as 'mahasiswa' | 'bisnis',
    });

    return {
      data: { email_verified: true },
      message: 'Email berhasil diverifikasi. Selamat datang di StairsLife! 🎉',
    };
  }

  async resendVerification(email: string, ctx?: RequestContext) {
    const supabase = this.supabaseService.getClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, email, full_name, email_verified_at')
      .eq('email', email)
      .single();

    if (user && !user.email_verified_at) {
      void this._sendVerificationEmail(
        user.id,
        user.email,
        user.full_name,
        ctx,
      );
    }

    return {
      data: null,
      message:
        'Kalau email kamu terdaftar dan belum diverifikasi, link verifikasi baru sudah dikirim.',
    };
  }

  async forgotPassword(email: string, ctx?: RequestContext) {
    const supabase = this.supabaseService.getClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, email, full_name, password_hash')
      .eq('email', email)
      .single();

    if (user) {
      const { rawToken } = await this.verificationToken.create({
        userId: user.id,
        type: 'password_reset',
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      });

      void this.emailService.sendPasswordResetEmail({
        to: user.email,
        fullName: user.full_name,
        rawToken,
      });
    }

    return {
      data: null,
      message:
        'Jika email terdaftar, link reset password akan dikirim ke inbox kamu.',
    };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const result = await this.verificationToken.consume({
      rawToken,
      type: 'password_reset',
    });

    if (!result) {
      throw new BadRequestException(
        'Link reset password tidak valid atau sudah kedaluwarsa.',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const supabase = this.supabaseService.getClient();
    const { error } = await supabase
      .from('users')
      .update({
        password_hash: hashedPassword,
        updated_at: new Date().toISOString(),
      })
      .eq('id', result.userId);

    if (error) {
      throw new BadRequestException('Gagal update password');
    }

    await this.sesi.cabutSemua(result.userId);

    return {
      data: null,
      message: 'Password berhasil direset. Silakan login dengan password baru.',
    };
  }

  async refresh(refreshToken?: string, ctx?: RequestContext) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token tidak ditemukan');
    }

    let payload: any;
    try {
      payload = this.tokenService.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException(
        'Refresh token tidak valid atau sudah expired',
      );
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token bukan refresh token');
    }

    if (!payload.jti || !(await this.sesi.pakai(payload.jti, payload.sub))) {
      throw new UnauthorizedException({
        message: 'Sesi sudah berakhir. Silakan masuk lagi.',
        code: 'SESSION_REVOKED',
      });
    }

    const supabase = this.supabaseService.getClient();
    const { data: user } = await supabase
      .from('users')
      .select(
        'id, full_name, email, role, tier, is_verified, is_suspended, email_verified_at',
      )
      .eq('id', payload.sub)
      .single();

    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan');
    }
    if (user.is_suspended) {
      throw new UnauthorizedException('Akun di-suspend');
    }

    const userPayload = {
      ...user,
      email_verified: !!user.email_verified_at,
    };
    delete (userPayload as any).email_verified_at;

    const tokens = await this.buatPasanganToken(userPayload, ctx);

    return {
      data: { user: userPayload, ...tokens },
      message: 'Token berhasil diperbarui',
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = this.tokenService.verifyRefresh(refreshToken);
        if (payload?.type === 'refresh' && payload.jti) {
          await this.sesi.pakai(payload.jti, payload.sub);
        }
      } catch {
        /* token tidak valid: tidak ada sesi yang perlu dicabut */
      }
    }
    return { data: null, message: 'Logout berhasil' };
  }

  private async _sendVerificationEmail(
    userId: string,
    email: string,
    fullName: string,
    ctx?: RequestContext,
  ): Promise<void> {
    try {
      const { rawToken } = await this.verificationToken.create({
        userId,
        type: 'email_verification',
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      });

      await this.emailService.sendVerificationEmail({
        to: email,
        fullName,
        rawToken,
      });
    } catch (err: any) {
      console.error(`[Auth] gagal kirim verification email: ${err.message}`);
    }
  }

  async buatPasanganToken(
    user: { id: string; email: string; role: string },
    ctx?: RequestContext,
  ): Promise<{ token: string; refresh_token: string }> {
    const basePayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const jti = await this.sesi.buat({
      userId: user.id,
      ttlMs: this.tokenService.refreshTtlMs(),
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });

    return {
      token: this.tokenService.signAccess(basePayload),
      refresh_token: this.tokenService.signRefresh({ ...basePayload, jti }),
    };
  }
}
