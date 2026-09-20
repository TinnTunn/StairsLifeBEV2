// Akses basis data pembayaran.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class PaymentsRepository {
  constructor(private prisma: PrismaService) {}

  async create(payload: any) {
    return this.prisma.payments.create({
      data: {
        ...payload,
        status: payload.status ?? ('held' as any),
      },
    });
  }

  async findById(id: string) {
    return this.prisma.payments.findUnique({
      where: { id },
      include: {
        contracts: {
          select: {
            id: true,
            agreed_budget: true,
            status: true,
            projects: {
              select: { id: true, title: true },
            },
          },
        },
      },
    });
  }

  async findByContractId(contractId: string) {
    return this.prisma.payments.findFirst({
      where: { contract_id: contractId },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.payments.findMany({
      where: {
        OR: [{ payer_id: userId }, { payee_id: userId }],
      },
      select: {
        id: true,
        contract_id: true,
        amount: true,
        platform_fee: true,
        net_amount: true,
        status: true,
        payer_id: true,
        payee_id: true,
        proof_url: true,
        held_at: true,
        released_at: true,
        created_at: true,
        xendit_invoice_url: true,
        xendit_invoice_id: true,
        payment_method: true,
        payment_channel: true,
        expires_at: true,
        paid_at: true,
        contracts: {
          select: {
            id: true,
            agreed_budget: true,
            status: true,
            projects: {
              select: { id: true, title: true },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async update(id: string, payload: any) {
    return this.prisma.payments.update({
      where: { id },
      data: payload,
    });
  }
}
