// Logika pendaftaran dan pengelolaan rekening bank.

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateBankAccountDto) {
    const existing = await this.prisma.bank_accounts.findFirst({
      where: { user_id: userId, account_number: dto.account_number },
    });
    if (existing) {
      throw new ConflictException('Nomor rekening ini sudah terdaftar');
    }

    const count = await this.prisma.bank_accounts.count({
      where: { user_id: userId },
    });
    const isPrimary = dto.is_primary === true || count === 0;

    if (isPrimary) {
      await this.prisma.bank_accounts.updateMany({
        where: { user_id: userId, is_primary: true },
        data: { is_primary: false },
      });
    }

    const account = await this.prisma.bank_accounts.create({
      data: {
        user_id: userId,
        bank_name: dto.bank_name,
        bank_code: dto.bank_code.toUpperCase(),
        account_number: dto.account_number,
        account_holder: dto.account_holder,
        is_primary: isPrimary,
      },
    });

    return { data: account, message: 'Rekening berhasil ditambahkan' };
  }

  async findByUser(userId: string) {
    const accounts = await this.prisma.bank_accounts.findMany({
      where: { user_id: userId },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'desc' }],
    });
    return { data: accounts, message: 'Berhasil' };
  }

  async findById(id: string, userId: string) {
    const account = await this.prisma.bank_accounts.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException('Rekening tidak ditemukan');
    if (account.user_id !== userId) {
      throw new ForbiddenException('Bukan rekening kamu');
    }
    return { data: account, message: 'Berhasil' };
  }

  async setPrimary(id: string, userId: string) {
    const account = await this.prisma.bank_accounts.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException('Rekening tidak ditemukan');
    if (account.user_id !== userId) {
      throw new ForbiddenException('Bukan rekening kamu');
    }
    if (account.is_primary) {
      return { data: account, message: 'Sudah primary' };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.bank_accounts.updateMany({
        where: { user_id: userId, is_primary: true },
        data: { is_primary: false },
      });
      return tx.bank_accounts.update({
        where: { id },
        data: { is_primary: true },
      });
    });

    return { data: updated, message: 'Rekening utama diperbarui' };
  }

  async delete(id: string, userId: string) {
    const account = await this.prisma.bank_accounts.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException('Rekening tidak ditemukan');
    if (account.user_id !== userId) {
      throw new ForbiddenException('Bukan rekening kamu');
    }

    const inUse = await this.prisma.withdrawals.findFirst({
      where: {
        bank_account_id: id,
        status: { in: ['pending', 'processing'] },
      },
    });
    if (inUse) {
      throw new BadRequestException(
        'Rekening sedang dipakai untuk penarikan yang belum selesai',
      );
    }

    await this.prisma.bank_accounts.delete({ where: { id } });
    return { data: { id }, message: 'Rekening dihapus' };
  }
}
