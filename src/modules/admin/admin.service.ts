// Logika panel admin: statistik, pengguna, verifikasi, dan pengaturan.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import {
  ResolveDisputeDto,
  DisputeStatus,
  DisputeOutcome,
} from './dto/resolve-dispute.dto';
import { SendAnnouncementDto } from './dto/send-announcement.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getStats() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalProjects,
      activeProjects,
      pendingVerifications,
      activeDisputes,
    ] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.projects.count(),
      this.prisma.projects.count({ where: { status: 'open' } }),
      this.prisma.verifications.count({ where: { status: 'pending' } }),
      this.prisma.disputes.count({ where: { status: 'open' } }),
    ]);

    const recentProjects = await this.prisma.projects.findMany({
      where: { created_at: { gte: thirtyDaysAgo } },
      select: { created_at: true },
      orderBy: { created_at: 'asc' },
    });

    const recentUsers = await this.prisma.users.findMany({
      where: { created_at: { gte: thirtyDaysAgo } },
      select: { created_at: true },
      orderBy: { created_at: 'asc' },
    });

    const now = new Date();
    const projectMap: Record<string, number> = {};
    const regMap: Record<string, number> = {};

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      projectMap[key] = 0;
      regMap[key] = 0;
    }

    recentProjects.forEach((p) => {
      if (!p.created_at) return;
      const key = new Date(p.created_at).toISOString().split('T')[0];
      if (key in projectMap) projectMap[key]++;
    });

    recentUsers.forEach((u) => {
      if (!u.created_at) return;
      const key = new Date(u.created_at).toISOString().split('T')[0];
      if (key in regMap) regMap[key]++;
    });

    const project_trend = Object.entries(projectMap).map(([date, count]) => ({
      date,
      count,
    }));
    const registration_trend = Object.entries(regMap).map(([date, count]) => ({
      date,
      count,
    }));

    return {
      data: {
        total_users: totalUsers,
        total_projects: totalProjects,
        active_projects: activeProjects,
        pending_verifications: pendingVerifications,
        active_disputes: activeDisputes,
        project_trend,
        registration_trend,
      },
      message: 'Berhasil',
    };
  }

  async getAllUsers(role?: string) {
    const users = await this.prisma.users.findMany({
      where: role ? { role: role as any } : undefined,
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        tier: true,
        is_verified: true,
        is_suspended: true,
        suspension_reason: true,
        created_at: true,
        avatar_url: true,
        university: true,
        major: true,
        company_name: true,
        phone: true,
      },
      orderBy: { created_at: 'desc' },
    });
    return { data: users, message: 'Berhasil' };
  }

  async cariUsers(args: {
    role?: string;
    q?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = {};
    const dan: Record<string, unknown>[] = [];
    if (args.role) where.role = args.role;
    if (args.status === 'aktif')
      dan.push({ OR: [{ is_suspended: false }, { is_suspended: null }] });
    if (args.status === 'dibekukan') dan.push({ is_suspended: true });
    if (args.status === 'belumVerifikasi')
      dan.push({ OR: [{ is_verified: false }, { is_verified: null }] });
    const q = args.q?.trim();
    if (q) {
      dan.push({
        OR: ['full_name', 'email', 'company_name', 'university'].map((f) => ({
          [f]: { contains: q, mode: 'insensitive' },
        })),
      });
    }
    dan.push({
      OR: [
        { suspension_reason: null },
        { suspension_reason: { not: 'account_deleted' } },
      ],
    });
    if (dan.length) where.AND = dan;

    const [total, items] = await Promise.all([
      this.prisma.users.count({ where: where as any }),
      this.prisma.users.findMany({
        where: where as any,
        select: {
          id: true,
          full_name: true,
          email: true,
          role: true,
          tier: true,
          is_verified: true,
          is_suspended: true,
          suspension_reason: true,
          created_at: true,
          avatar_url: true,
          university: true,
          major: true,
          company_name: true,
          phone: true,
        },
        orderBy: { created_at: 'desc' },
        skip: (args.page - 1) * args.limit,
        take: args.limit,
      }),
    ]);

    return {
      data: { items, total, page: args.page, limit: args.limit },
      message: 'Berhasil',
    };
  }

  async toggleSuspendUser(userId: string, reason?: string) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (user.suspension_reason === 'account_deleted') {
      throw new BadRequestException({
        message:
          'Akun ini sudah dihapus pemiliknya dan tidak bisa diaktifkan lagi',
        code: 'ACCOUNT_DELETED',
      });
    }

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: {
        is_suspended: !user.is_suspended,
        suspension_reason: !user.is_suspended
          ? reason || 'Disuspend oleh admin'
          : null,
        updated_at: new Date(),
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        is_suspended: true,
        suspension_reason: true,
      },
    });

    if (updated.is_suspended) {
      await this.prisma.verification_tokens.updateMany({
        where: { user_id: userId, type: 'refresh_session', used_at: null },
        data: { used_at: new Date() },
      });
    }

    void this.notificationsService.create({
      user_id: userId,
      type: 'system',
      title: updated.is_suspended ? '🚫 Akun Disuspend' : '✅ Akun Diaktifkan',
      body: updated.is_suspended
        ? `Akun kamu telah disuspend. Alasan: ${updated.suspension_reason || 'Tidak disebutkan'}`
        : 'Akun kamu telah diaktifkan kembali. Selamat kembali ke StairsLife!',
      ref_id: userId,
      action_url: '/profile',
    });

    return {
      data: updated,
      message: updated.is_suspended
        ? 'Akun berhasil disuspend'
        : 'Akun berhasil diaktifkan',
    };
  }

  async deleteProject(projectId: string) {
    const project = await this.prisma.projects.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project tidak ditemukan');

    const contractCount = await this.prisma.contracts.count({
      where: { project_id: projectId },
    });
    if (contractCount > 0) {
      throw new BadRequestException(
        'Project ini sudah punya kontrak — tidak bisa dihapus. Selesaikan/batalkan kontraknya dulu.',
      );
    }

    await this.prisma.projects.delete({ where: { id: projectId } });
    return { data: { id: projectId }, message: 'Project berhasil dihapus' };
  }

  async getPendingVerifications(status: string = 'pending') {
    const verifications = await this.prisma.verifications.findMany({
      where: { status: status as any },
      include: {
        users_verifications_user_idTousers: {
          select: { id: true, full_name: true, email: true, university: true },
        },
      },
      orderBy: { submitted_at: 'asc' },
    });

    const mapped = verifications.map((v) => ({
      ...v,
      user: v.users_verifications_user_idTousers,
    }));

    return { data: mapped, message: 'Berhasil' };
  }

  async reviewVerification(
    verificationId: string,
    dto: ReviewVerificationDto,
    adminId: string,
  ) {
    const verification = await this.prisma.verifications.findUnique({
      where: { id: verificationId },
    });
    if (!verification)
      throw new NotFoundException('Verifikasi tidak ditemukan');

    const updated = await this.prisma.verifications.update({
      where: { id: verificationId },
      data: {
        status: dto.status as any,
        reviewed_by: adminId,
        rejection_reason: dto.rejection_reason ?? null,
        reviewed_at: new Date(),
      },
    });

    if (dto.status === 'approved') {
      await this.prisma.users.update({
        where: { id: verification.user_id },
        data: { is_verified: true, updated_at: new Date() },
      });
    }

    void this.notificationsService.create({
      user_id: verification.user_id,
      type: 'verification',
      title:
        dto.status === 'approved'
          ? '✅ Verifikasi KTM Disetujui'
          : '❌ Verifikasi KTM Ditolak',
      body:
        dto.status === 'approved'
          ? 'Selamat! KTM kamu sudah diverifikasi. Sekarang kamu bisa melamar project tanpa batas.'
          : `KTM kamu ditolak. ${dto.rejection_reason || 'Silakan upload ulang dengan foto yang lebih jelas.'}`,
      ref_id: verification.id,
      action_url: '/profile',
    });

    return {
      data: updated,
      message:
        dto.status === 'approved'
          ? 'Verifikasi disetujui'
          : 'Verifikasi ditolak',
    };
  }

  async getAllDisputes(status?: string) {
    const disputes = await this.prisma.disputes.findMany({
      where: status ? { status } : undefined,
      include: {
        contracts: {
          include: {
            projects: { select: { id: true, title: true } },
            users_contracts_student_idTousers: {
              select: { id: true, full_name: true, role: true },
            },
            users_contracts_business_idTousers: {
              select: { id: true, full_name: true, role: true },
            },
          },
        },
        users_disputes_opened_byTousers: {
          select: { id: true, full_name: true, role: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return { data: disputes, message: 'Berhasil' };
  }

  async getDisputeById(id: string) {
    const dispute = await this.prisma.disputes.findUnique({
      where: { id },
      include: {
        contracts: {
          include: {
            projects: { select: { id: true, title: true } },
            users_contracts_student_idTousers: {
              select: { id: true, full_name: true, role: true },
            },
            users_contracts_business_idTousers: {
              select: { id: true, full_name: true, role: true },
            },
            payments: {
              select: {
                id: true,
                status: true,
                amount: true,
                platform_fee: true,
                net_amount: true,
              },
            },
          },
        },
        users_disputes_opened_byTousers: {
          select: { id: true, full_name: true, role: true },
        },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute tidak ditemukan');
    return { data: dispute, message: 'Berhasil' };
  }

  async resolveDispute(
    disputeId: string,
    dto: ResolveDisputeDto,
    adminId: string,
  ) {
    const dispute = await this.prisma.disputes.findUnique({
      where: { id: disputeId },
      include: {
        contracts: {
          include: {
            projects: { select: { title: true } },
            payments: true,
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute tidak ditemukan');

    if (dispute.status === 'resolved') {
      throw new BadRequestException(
        'Dispute sudah pernah di-resolve. Tidak bisa di-resolve ulang.',
      );
    }

    const contract = dispute.contracts;
    const payment = contract?.payments?.[0] ?? null;

    if (dto.status !== DisputeStatus.RESOLVED) {
      const updated = await this.prisma.disputes.update({
        where: { id: disputeId },
        data: {
          status: dto.status,
          admin_notes: dto.admin_notes ?? null,
          resolved_by: dto.status === DisputeStatus.REJECTED ? adminId : null,
          resolved_at:
            dto.status === DisputeStatus.REJECTED ? new Date() : null,
        },
      });

      this._notifyDisputeUpdate(dispute, dto.status, dto.admin_notes);
      return { data: updated, message: 'Status dispute berhasil diperbarui' };
    }

    const outcome = dto.outcome;
    if (!outcome) {
      throw new BadRequestException(
        'Field `outcome` wajib diisi saat status = resolved',
      );
    }

    const needsPayment =
      outcome === DisputeOutcome.FAVOR_BUSINESS ||
      outcome === DisputeOutcome.FAVOR_STUDENT ||
      outcome === DisputeOutcome.SPLIT;

    if (needsPayment && !payment) {
      throw new BadRequestException(
        'Kontrak ini belum punya payment di escrow. Outcome finansial tidak bisa diterapkan.',
      );
    }

    if (needsPayment && payment && payment.status !== 'held') {
      throw new BadRequestException(
        `Payment sudah dalam status "${payment.status}", tidak bisa diubah lagi oleh dispute resolution.`,
      );
    }

    let studentShare = 0;
    let businessShare = 0;
    if (outcome === DisputeOutcome.SPLIT) {
      const pct = dto.student_share_percent;
      if (pct === undefined || pct === null) {
        throw new BadRequestException(
          'student_share_percent wajib diisi untuk outcome = split (0..100)',
        );
      }
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new BadRequestException(
          'student_share_percent harus angka 0..100',
        );
      }
      const net = payment.net_amount;
      studentShare = Math.round((net * pct) / 100);
      businessShare = net - studentShare;
    } else if (outcome === DisputeOutcome.FAVOR_STUDENT) {
      studentShare = payment.net_amount;
      businessShare = 0;
    } else if (outcome === DisputeOutcome.FAVOR_BUSINESS) {
      studentShare = 0;
      businessShare = payment.net_amount;
    }

    let newPaymentStatus: string | null = null;
    if (outcome === DisputeOutcome.FAVOR_BUSINESS) {
      newPaymentStatus = 'refunded';
    } else if (outcome === DisputeOutcome.FAVOR_STUDENT) {
      newPaymentStatus = 'released';
    } else if (outcome === DisputeOutcome.SPLIT) {
      newPaymentStatus = 'split_settled';
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedDispute = await tx.disputes.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          admin_notes: dto.admin_notes ?? null,
          resolved_by: adminId,
          resolved_at: now,
        },
      });

      if (newPaymentStatus && payment) {
        await tx.payments.update({
          where: { id: payment.id },
          data: {
            status: newPaymentStatus as any,
            released_at:
              newPaymentStatus === 'released' ||
              newPaymentStatus === 'split_settled'
                ? now
                : null,
            refunded_at:
              newPaymentStatus === 'refunded' ||
              newPaymentStatus === 'split_settled'
                ? now
                : null,
          },
        });

        if (studentShare > 0) {
          const wallet = await tx.wallets.upsert({
            where: { user_id: contract.student_id },
            update: {},
            create: { user_id: contract.student_id },
          });
          await tx.wallets.update({
            where: { id: wallet.id },
            data: {
              amount: { increment: studentShare },
              total_earned: { increment: studentShare },
              updated_at: new Date(),
            },
          });
          await tx.wallet_transactions.create({
            data: {
              wallet_id: wallet.id,
              user_id: contract.student_id,
              type:
                outcome === DisputeOutcome.SPLIT
                  ? 'earn_split'
                  : 'earn_release',
              amount: BigInt(studentShare),
              ref_type: 'dispute',
              ref_id: disputeId,
              description: `Resolusi sengketa (${outcome})`,
            },
          });
        }
      }

      if (contract && newPaymentStatus) {
        let newContractStatus: string | null = null;
        if (outcome === DisputeOutcome.FAVOR_BUSINESS) {
          newContractStatus = 'cancelled';
        } else if (
          outcome === DisputeOutcome.FAVOR_STUDENT ||
          outcome === DisputeOutcome.SPLIT
        ) {
          newContractStatus = 'completed';
        }

        if (newContractStatus) {
          await tx.contracts.update({
            where: { id: contract.id },
            data: { status: newContractStatus as any },
          });
        }
      }

      return updatedDispute;
    });

    this._notifyDisputeResolved(
      dispute,
      outcome,
      studentShare,
      businessShare,
      dto.admin_notes,
    );

    return {
      data: updated,
      message: 'Dispute berhasil diselesaikan',
    };
  }

  private _notifyDisputeUpdate(
    dispute: any,
    status: DisputeStatus,
    adminNotes?: string,
  ) {
    const contract = dispute.contracts;
    if (!contract) return;

    const titleMap: Record<DisputeStatus, string> = {
      [DisputeStatus.UNDER_REVIEW]: '🔍 Sengketa Sedang Ditinjau',
      [DisputeStatus.REJECTED]: '❌ Sengketa Ditolak',
      [DisputeStatus.RESOLVED]: '✅ Sengketa Diselesaikan',
    };

    const projectTitle = contract.projects?.title || 'project';
    const body = adminNotes
      ? `Sengketa untuk "${projectTitle}" diupdate admin. Catatan: ${adminNotes.slice(0, 120)}`
      : `Sengketa untuk "${projectTitle}" diupdate admin.`;

    void this.notificationsService.createBulk(
      [contract.student_id, contract.business_id],
      {
        type: 'dispute',
        title: titleMap[status],
        body,
        ref_id: dispute.id,
        action_url: `/disputes/${dispute.id}`,
      },
    );
  }

  private _notifyDisputeResolved(
    dispute: any,
    outcome: DisputeOutcome,
    studentShare: number,
    businessShare: number,
    adminNotes?: string,
  ) {
    const contract = dispute.contracts;
    if (!contract) return;

    const projectTitle = contract.projects?.title || 'project';
    const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
    const note = adminNotes
      ? ` Catatan admin: ${adminNotes.slice(0, 120)}`
      : '';

    let studentMsg: string;
    let businessMsg: string;

    switch (outcome) {
      case DisputeOutcome.FAVOR_STUDENT:
        studentMsg = `Sengketa untuk "${projectTitle}" diselesaikan: dana ${fmt(studentShare)} sudah cair ke saldo kamu.${note}`;
        businessMsg = `Sengketa untuk "${projectTitle}" diselesaikan: dana di-release ke mahasiswa (${fmt(studentShare)}).${note}`;
        break;
      case DisputeOutcome.FAVOR_BUSINESS:
        studentMsg = `Sengketa untuk "${projectTitle}" diselesaikan: dana di-refund ke klien.${note}`;
        businessMsg = `Sengketa untuk "${projectTitle}" diselesaikan: refund ${fmt(businessShare)} akan diproses ke metode pembayaran kamu.${note}`;
        break;
      case DisputeOutcome.SPLIT:
        studentMsg = `Sengketa untuk "${projectTitle}" diselesaikan (split): kamu menerima ${fmt(studentShare)}.${note}`;
        businessMsg = `Sengketa untuk "${projectTitle}" diselesaikan (split): refund ${fmt(businessShare)} ke kamu, ${fmt(studentShare)} ke mahasiswa.${note}`;
        break;
      case DisputeOutcome.NO_ACTION:
      default:
        studentMsg = `Sengketa untuk "${projectTitle}" ditutup admin tanpa perubahan dana.${note}`;
        businessMsg = studentMsg;
    }

    void this.notificationsService.create({
      user_id: contract.student_id,
      type: 'dispute',
      title: '✅ Sengketa Diselesaikan',
      body: studentMsg,
      ref_id: dispute.id,
      action_url: `/disputes/${dispute.id}`,
    });
    void this.notificationsService.create({
      user_id: contract.business_id,
      type: 'dispute',
      title: '✅ Sengketa Diselesaikan',
      body: businessMsg,
      ref_id: dispute.id,
      action_url: `/disputes/${dispute.id}`,
    });
  }

  async getAllProjects(status?: string) {
    const projects = await this.prisma.projects.findMany({
      where: status ? { status: status as any } : undefined,
      include: { users: { select: { id: true, full_name: true } } },
      orderBy: { created_at: 'desc' },
    });

    const mapped = projects.map((p) => ({ ...p, business: p.users }));
    return { data: mapped, message: 'Berhasil' };
  }

  async getProjectContracts(projectId: string) {
    const contracts = await this.prisma.contracts.findMany({
      where: { project_id: projectId },
      include: {
        users_contracts_student_idTousers: {
          select: { id: true, full_name: true, email: true },
        },
        users_contracts_business_idTousers: {
          select: { id: true, full_name: true, email: true },
        },
        contract_deliverables: { orderBy: { submitted_at: 'desc' } },
      },
    });
    return { data: contracts, message: 'Berhasil' };
  }

  async sendAnnouncement(dto: SendAnnouncementDto, adminId: string) {
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    const duplicate = await this.prisma.announcements.findFirst({
      where: {
        sent_by: adminId,
        title: dto.title,
        body: dto.body,
        target: dto.target as any,
        created_at: { gte: tenSecondsAgo },
      },
      orderBy: { created_at: 'desc' },
    });
    if (duplicate) {
      return {
        data: duplicate,
        message: 'Announcement sudah dikirim sebelumnya',
      };
    }

    const announcement = await this.prisma.announcements.create({
      data: {
        title: dto.title,
        body: dto.body,
        target: dto.target,
        sent_by: adminId,
      },
    });

    try {
      const whereTarget: any = { is_suspended: false };
      const t = String(dto.target).toLowerCase();
      if (t === 'student' || t === 'mahasiswa') whereTarget.role = 'mahasiswa';
      else if (t === 'bisnis' || t === 'business') whereTarget.role = 'bisnis';
      else {
        whereTarget.role = { in: ['mahasiswa', 'bisnis'] as any };
      }

      const targetUsers = await this.prisma.users.findMany({
        where: whereTarget,
        select: { id: true },
      });

      void this.notificationsService.createBulk(
        targetUsers.map((u) => u.id),
        {
          type: 'system',
          title: `📢 ${dto.title}`,
          body: dto.body,
          ref_id: announcement.id,
          action_url: null,
        },
      );
    } catch (e) {
      console.warn('[announcement] fan-out gagal:', (e as Error).message);
    }

    return { data: announcement, message: 'Announcement berhasil dikirim' };
  }

  async getAnnouncements() {
    const announcements = await this.prisma.announcements.findMany({
      orderBy: { created_at: 'desc' },
    });
    return { data: announcements, message: 'Berhasil' };
  }

  async getFinances() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allTime, today, thisWeek, thisMonth] = await Promise.all([
      this.prisma.payments.aggregate({
        where: { status: 'released' },
        _sum: { platform_fee: true, amount: true },
        _count: { id: true },
      }),
      this.prisma.payments.aggregate({
        where: { status: 'released', released_at: { gte: todayStart } },
        _sum: { platform_fee: true },
      }),
      this.prisma.payments.aggregate({
        where: { status: 'released', released_at: { gte: weekStart } },
        _sum: { platform_fee: true },
      }),
      this.prisma.payments.aggregate({
        where: { status: 'released', released_at: { gte: monthStart } },
        _sum: { platform_fee: true },
      }),
    ]);

    const last30 = new Date(now);
    last30.setDate(now.getDate() - 29);
    last30.setHours(0, 0, 0, 0);
    const dailyPayments = await this.prisma.payments.findMany({
      where: { status: 'released', released_at: { gte: last30 } },
      select: { platform_fee: true, released_at: true },
      orderBy: { released_at: 'asc' },
    });

    const dailyMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyMap[key] = 0;
    }
    dailyPayments.forEach((p) => {
      if (!p.released_at) return;
      const key = p.released_at.toISOString().split('T')[0];
      if (key in dailyMap) dailyMap[key] += p.platform_fee || 0;
    });

    return {
      data: {
        summary: {
          total_komisi: allTime._sum.platform_fee || 0,
          total_gmv: allTime._sum.amount || 0,
          total_transaksi: allTime._count.id || 0,
          komisi_hari_ini: today._sum.platform_fee || 0,
          komisi_minggu_ini: thisWeek._sum.platform_fee || 0,
          komisi_bulan_ini: thisMonth._sum.platform_fee || 0,
        },
        daily_trend: Object.entries(dailyMap).map(([date, komisi]) => ({
          date,
          komisi,
        })),
      },
      message: 'Berhasil',
    };
  }

  async getFinancesDetail(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [payments, total] = await Promise.all([
      this.prisma.payments.findMany({
        where,
        include: {
          contracts: {
            include: {
              projects: { select: { id: true, title: true, category: true } },
              users_contracts_student_idTousers: {
                select: { id: true, full_name: true },
              },
              users_contracts_business_idTousers: {
                select: { id: true, full_name: true },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payments.count({ where }),
    ]);

    return {
      data: {
        payments,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      },
      message: 'Berhasil',
    };
  }

  async getSettings() {
    const settings = await this.prisma.platform_settings.findMany();
    const data: Record<string, any> = {};
    settings.forEach((s) => {
      data[s.key] = isNaN(Number(s.value)) ? s.value : Number(s.value);
    });

    return {
      data: {
        platform_fee: data.platform_fee ?? 5,
        verification_sla_days: data.verification_sla_days ?? 2,
      },
      message: 'Berhasil',
    };
  }

  async updateSettings(payload: {
    platform_fee?: number;
    verification_sla_days?: number;
  }) {
    const updates = [];

    if (payload.platform_fee !== undefined) {
      updates.push(
        this.prisma.platform_settings.upsert({
          where: { key: 'platform_fee' },
          update: {
            value: String(payload.platform_fee),
            updated_at: new Date(),
          },
          create: { key: 'platform_fee', value: String(payload.platform_fee) },
        }),
      );
    }

    if (payload.verification_sla_days !== undefined) {
      updates.push(
        this.prisma.platform_settings.upsert({
          where: { key: 'verification_sla_days' },
          update: {
            value: String(payload.verification_sla_days),
            updated_at: new Date(),
          },
          create: {
            key: 'verification_sla_days',
            value: String(payload.verification_sla_days),
          },
        }),
      );
    }

    await Promise.all(updates);

    return this.getSettings();
  }
}
