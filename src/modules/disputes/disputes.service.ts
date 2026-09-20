// Logika sengketa dan mediasinya.

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

export const STATUS_SENGKETA_AKTIF = ['open', 'under_review', 'mediation'];

const STATUS_KONTRAK_BISA_DISENGKETAKAN = ['active', 'pending_review'];

@Injectable()
export class DisputesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateDisputeDto) {
    const { contract_id, reason, evidence_url } = dto;

    const contract = await this.prisma.contracts.findFirst({
      where: {
        id: contract_id,
        OR: [{ student_id: userId }, { business_id: userId }],
      },
      include: { projects: { select: { title: true } } },
    });

    if (!contract) throw new BadRequestException('Kontrak tidak ditemukan');
    if (!STATUS_KONTRAK_BISA_DISENGKETAKAN.includes(String(contract.status))) {
      throw new BadRequestException({
        message:
          'Sengketa hanya bisa diajukan untuk kontrak yang masih berjalan atau menunggu review.',
        code: 'CONTRACT_NOT_DISPUTABLE',
      });
    }

    const existingActive = await this.prisma.disputes.findFirst({
      where: {
        contract_id,
        status: { in: STATUS_SENGKETA_AKTIF },
      },
      orderBy: { created_at: 'desc' },
    });

    if (existingActive) {
      return {
        data: existingActive,
        message: 'Sengketa untuk kontrak ini sudah ada dan masih aktif',
      };
    }

    const dispute = await this.prisma.disputes.create({
      data: {
        contract_id,
        opened_by: userId,
        reason,
        evidence_url: evidence_url ?? null,
        status: 'open',
      },
    });

    const otherPartyId =
      userId === contract.student_id
        ? contract.business_id
        : contract.student_id;

    const opener = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { full_name: true },
    });

    void this.notificationsService.create({
      user_id: otherPartyId,
      type: 'dispute',
      title: '⚠️ Sengketa Dibuka',
      body: `${opener?.full_name || 'Pihak lain'} membuka sengketa untuk project "${contract.projects?.title || 'kamu'}". Alasan: ${reason.slice(0, 80)}${reason.length > 80 ? '...' : ''}`,
      ref_id: dispute.id,
      action_url: `/disputes/${dispute.id}`,
    });

    try {
      const admins = await this.prisma.users.findMany({
        where: { role: 'admin' as any },
        select: { id: true },
      });
      await this.notificationsService.createBulk(
        admins.map((a) => a.id),
        {
          type: 'dispute',
          title: '🚨 Sengketa Baru',
          body: `Sengketa baru untuk project "${contract.projects?.title || 'project'}" — perlu di-review.`,
          ref_id: dispute.id,
          action_url: `/admin/disputes/${dispute.id}`,
        },
      );
    } catch (e) {
      console.warn('[dispute] gagal notif admin:', (e as Error).message);
    }

    return { data: dispute, message: 'Sengketa berhasil diajukan' };
  }

  async getMy(userId: string) {
    const disputes = await this.prisma.disputes.findMany({
      where: {
        OR: [
          { opened_by: userId },
          {
            contracts: {
              OR: [{ student_id: userId }, { business_id: userId }],
            },
          },
        ],
      },
      include: {
        contracts: {
          include: { projects: { select: { title: true } } },
        },
        users_disputes_opened_byTousers: {
          select: { id: true, full_name: true, role: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const mapped = disputes.map((d) => ({
      id: d.id,
      project: d.contracts?.projects?.title || 'Project',
      reason: d.reason,
      evidence_url: d.evidence_url,
      status: d.status,
      created_at: d.created_at,
      resolved_at: d.resolved_at,
      admin_notes: d.admin_notes,
      contract_id: d.contract_id,
      opened_by: d.opened_by,
      opened_by_me: d.opened_by === userId,
      opener: d.users_disputes_opened_byTousers,
    }));

    return { data: mapped, message: 'Berhasil' };
  }

  async getById(id: string, userId: string) {
    const dispute = await this.prisma.disputes.findUnique({
      where: { id },
      include: {
        contracts: {
          include: {
            projects: { select: { id: true, title: true } },
            users_contracts_student_idTousers: {
              select: { id: true, full_name: true },
            },
            users_contracts_business_idTousers: {
              select: { id: true, full_name: true },
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

    if (!dispute) throw new NotFoundException('Sengketa tidak ditemukan');

    const contract = dispute.contracts;
    const isInvolved =
      dispute.opened_by === userId ||
      contract?.student_id === userId ||
      contract?.business_id === userId;

    if (!isInvolved) {
      throw new ForbiddenException('Kamu tidak punya akses ke sengketa ini');
    }

    const bagian = await this.prisma.wallet_transactions.findFirst({
      where: { ref_type: 'dispute', ref_id: id },
      select: { amount: true },
    });

    return {
      data: {
        ...dispute,
        student_share: bagian ? Number(bagian.amount) : null,
      },
      message: 'Berhasil',
    };
  }

  async addEvidence(
    id: string,
    body: { evidence_url: string; description?: string },
    userId: string,
  ) {
    if (!body?.evidence_url) {
      throw new BadRequestException('evidence_url wajib diisi');
    }

    const dispute = await this.prisma.disputes.findUnique({
      where: { id },
      include: { contracts: true },
    });

    if (!dispute) throw new NotFoundException('Sengketa tidak ditemukan');

    const isOwner = dispute.opened_by === userId;
    if (!isOwner) {
      throw new ForbiddenException(
        'Hanya pihak yang membuka sengketa yang bisa menambah bukti',
      );
    }

    if (!STATUS_SENGKETA_AKTIF.includes(String(dispute.status))) {
      throw new BadRequestException(
        'Sengketa sudah ditutup, tidak bisa menambah bukti baru',
      );
    }

    const updated = await this.prisma.disputes.update({
      where: { id },
      data: { evidence_url: body.evidence_url },
    });

    return {
      data: updated,
      message: 'Bukti tambahan berhasil ditambahkan',
    };
  }
}
