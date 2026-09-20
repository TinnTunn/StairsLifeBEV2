// Logika pengaturan akun: ganti kata sandi dan alamat email.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../config/prisma.service';
import { SupabaseService } from '../../config/supabase.config';
import { EmailService } from '../email/email.service';
import { AuthService, type RequestContext } from './auth.service';
import { SesiService } from './sesi.service';
import { TokenService } from './token.service';
import { VerificationTokenService } from './verification-token.service';

const TTL_GANTI_EMAIL = '1h';
const TTL_GANTI_EMAIL_MS = 60 * 60 * 1000;

@Injectable()
export class AkunService {
  private readonly logger = new Logger(AkunService.name);

  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
    private auth: AuthService,
    private sesi: SesiService,
    private tokens: TokenService,
    private verificationToken: VerificationTokenService,
    private email: EmailService,
  ) {}

  async gantiPassword(
    userId: string,
    current: string | undefined,
    baru: string,
    ctx?: RequestContext,
  ) {
    const user = await this.ambil(userId);
    if (user.password_hash) {
      await this.cekPassword(current ?? '', user.password_hash);
      if (await bcrypt.compare(baru, user.password_hash)) {
        throw new BadRequestException({
          message: 'Password baru harus berbeda dari password lama',
          code: 'PASSWORD_SAME',
        });
      }
    }

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        password_hash: await bcrypt.hash(baru, 12),
        updated_at: new Date(),
      },
    });

    await this.sesi.cabutSemua(userId);
    const pasangan = await this.auth.buatPasanganToken(user, ctx);
    return { data: pasangan, message: 'Password berhasil diganti' };
  }

  async mintaGantiEmail(userId: string, emailBaru: string, password: string) {
    const user = await this.ambil(userId);
    const target = emailBaru.trim();

    if (target.toLowerCase() === user.email.toLowerCase()) {
      throw new BadRequestException({
        message: 'Email baru sama dengan email sekarang',
        code: 'EMAIL_SAME',
      });
    }
    if (!user.password_hash) {
      throw new BadRequestException({
        message:
          'Atur password dulu lewat "Lupa password" sebelum mengganti email',
        code: 'PASSWORD_NOT_SET',
      });
    }
    await this.cekPassword(password, user.password_hash);
    await this.pastikanEmailBebas(target);

    const raw = this.tokens.signPurpose(
      { sub: userId, new_email: target, purpose: 'email_change' },
      TTL_GANTI_EMAIL,
    );
    await this.verificationToken.create({
      userId,
      type: 'email_change',
      rawToken: raw,
      ttlMs: TTL_GANTI_EMAIL_MS,
    });
    void this.email.sendEmailChangeEmail({
      to: target,
      fullName: user.full_name,
      rawToken: raw,
    });

    return {
      data: { pending_email: target },
      message: 'Link konfirmasi sudah dikirim ke email baru',
    };
  }

  async konfirmasiGantiEmail(token: string) {
    let payload: { sub?: string; new_email?: string; purpose?: string };
    try {
      payload = this.tokens.verifyPurpose(token);
    } catch {
      throw this.linkEmailTidakValid();
    }
    if (
      payload.purpose !== 'email_change' ||
      !payload.sub ||
      !payload.new_email
    ) {
      throw this.linkEmailTidakValid();
    }

    const dipakai = await this.verificationToken.consume({
      rawToken: token,
      type: 'email_change',
    });
    if (!dipakai || dipakai.userId !== payload.sub)
      throw this.linkEmailTidakValid();

    const user = await this.ambil(payload.sub);
    await this.pastikanEmailBebas(payload.new_email);
    const emailLama = user.email;

    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        email: payload.new_email,
        email_verified_at: new Date(),
        updated_at: new Date(),
      },
    });

    void this.email.sendEmailChangedNotice({
      to: emailLama,
      fullName: user.full_name,
      newEmail: payload.new_email,
    });

    return {
      data: { email: payload.new_email },
      message: 'Email berhasil diganti',
    };
  }

  async hapusAkun(userId: string, password: string, alasan?: string) {
    const user = await this.ambil(userId);
    if (user.role === 'admin') {
      throw new ForbiddenException({
        message: 'Akun admin tidak bisa dihapus dari sini',
        code: 'ACCOUNT_ADMIN',
      });
    }
    if (!user.password_hash) {
      throw new BadRequestException({
        message:
          'Atur password dulu lewat "Lupa password" sebelum menghapus akun',
        code: 'PASSWORD_NOT_SET',
      });
    }
    await this.cekPassword(password, user.password_hash);
    await this.cekBolehDihapus(userId);

    const penanda = userId.slice(0, 8);
    await this.prisma.$transaction(async (tx) => {
      await tx.projects.updateMany({
        where: { business_id: userId, status: 'open' },
        data: { status: 'cancelled' },
      });
      await tx.applications.deleteMany({
        where: {
          student_id: userId,
          status: { in: ['pending', 'shortlisted'] },
        },
      });
      await tx.bank_accounts.deleteMany({
        where: { user_id: userId, withdrawals: { none: {} } },
      });
      await tx.bank_accounts.updateMany({
        where: { user_id: userId },
        data: { account_holder: 'Pengguna dihapus', is_primary: false },
      });
      await tx.notifications.deleteMany({ where: { user_id: userId } });
      await tx.verifications.deleteMany({ where: { user_id: userId } });
      await tx.verification_tokens.deleteMany({
        where: { user_id: userId, type: { not: 'refresh_session' } },
      });
      await tx.users.update({
        where: { id: userId },
        data: {
          full_name: 'Pengguna dihapus',
          email: `dihapus-${penanda}-${Date.now()}@akun-dihapus.invalid`,
          password_hash: null,
          google_id: null,
          avatar_url: null,
          bio: null,
          phone: null,
          location: null,
          portfolio_url: null,
          skills: [],
          major: null,
          semester: null,
          business_type: null,
          is_suspended: true,
          suspension_reason: 'account_deleted',
          updated_at: new Date(),
        },
      });
    });

    await this.sesi.cabutSemua(userId);
    void this.hapusBerkasPribadi(userId);
    this.logger.log(
      `akun ${penanda} dihapus${alasan ? ` (alasan: ${alasan.slice(0, 120)})` : ''}`,
    );

    return { data: null, message: 'Akun berhasil dihapus' };
  }

  private async cekBolehDihapus(userId: string) {
    const [wallet, kontrakAktif, penarikan, sengketa] = await Promise.all([
      this.prisma.wallets.findUnique({ where: { user_id: userId } }),
      this.prisma.contracts.count({
        where: {
          OR: [{ student_id: userId }, { business_id: userId }],
          status: { in: ['active', 'pending_review', 'disputed'] },
        },
      }),
      this.prisma.withdrawals.count({
        where: { user_id: userId, status: { in: ['pending', 'processing'] } },
      }),
      this.prisma.disputes.count({
        where: {
          status: { in: ['open', 'under_review', 'mediation'] },
          contracts: { OR: [{ student_id: userId }, { business_id: userId }] },
        },
      }),
    ]);

    const saldo =
      Number(wallet?.amount ?? 0) + Number(wallet?.pending_amount ?? 0);
    if (saldo > 0) {
      throw new BadRequestException({
        message: `Masih ada saldo Rp ${saldo.toLocaleString('id-ID')}. Tarik saldo dulu sebelum menghapus akun.`,
        code: 'ACCOUNT_HAS_BALANCE',
        params: { amount: saldo },
      });
    }
    if (kontrakAktif > 0) {
      throw new BadRequestException({
        message: 'Masih ada kontrak yang berjalan. Selesaikan kontraknya dulu.',
        code: 'ACCOUNT_HAS_ACTIVE_CONTRACT',
        params: { count: kontrakAktif },
      });
    }
    if (penarikan > 0) {
      throw new BadRequestException({
        message: 'Masih ada penarikan dana yang sedang diproses.',
        code: 'ACCOUNT_HAS_PENDING_WITHDRAWAL',
      });
    }
    if (sengketa > 0) {
      throw new BadRequestException({
        message: 'Masih ada sengketa yang belum selesai.',
        code: 'ACCOUNT_HAS_OPEN_DISPUTE',
      });
    }
  }

  private async hapusBerkasPribadi(userId: string) {
    const storage = this.supabase.getClient().storage;
    const target: Array<[string, string]> = [
      ['verification', `ktm/${userId}`],
      ['verification', `selfie/${userId}`],
      ['stairslife-uploads', `avatars/${userId}`],
    ];
    for (const [bucket, folder] of target) {
      try {
        const { data } = await storage.from(bucket).list(folder);
        const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
        if (paths.length) await storage.from(bucket).remove(paths);
      } catch (e) {
        this.logger.warn(
          `gagal hapus berkas ${bucket}/${folder}: ${(e as Error).message}`,
        );
      }
    }
  }

  private async ambil(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        full_name: true,
        password_hash: true,
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  private async cekPassword(password: string, hash: string) {
    if (!(await bcrypt.compare(password, hash))) {
      throw new BadRequestException({
        message: 'Password yang kamu masukkan salah',
        code: 'PASSWORD_WRONG',
      });
    }
  }

  private async pastikanEmailBebas(email: string) {
    const ada = await this.prisma.users.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (ada)
      throw new ConflictException({
        message: 'Email sudah terdaftar',
        code: 'EMAIL_TAKEN',
      });
  }

  private linkEmailTidakValid() {
    return new BadRequestException({
      message: 'Link konfirmasi email tidak valid atau sudah kedaluwarsa.',
      code: 'EMAIL_CHANGE_LINK_INVALID',
    });
  }
}
