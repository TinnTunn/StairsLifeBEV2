// Logika pembuatan dan pembacaan notifikasi.

import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

export interface CreateNotificationPayload {
  user_id: string;
  type:
    | 'application'
    | 'contract'
    | 'payment'
    | 'review'
    | 'dispute'
    | 'verification'
    | 'system';
  title: string;
  body: string;
  ref_id?: string | null;
  action_url?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsGateway))
    private gateway: NotificationsGateway,
  ) {}

  async create(payload: CreateNotificationPayload) {
    try {
      const notif = await this.prisma.notifications.create({
        data: {
          user_id: payload.user_id,
          type: payload.type as any,
          title: payload.title,
          body: payload.body,
          ref_id: payload.ref_id ?? null,
          action_url: payload.action_url ?? null,
        },
      });

      try {
        await this.gateway.pushToUser(payload.user_id, notif);
      } catch (wsErr) {
        console.warn(
          '[NotificationsService] WS push gagal untuk',
          payload.user_id,
          (wsErr as Error).message,
        );
      }

      return notif;
    } catch (err) {
      console.warn(
        '[NotificationsService] gagal create notif:',
        (err as Error).message,
      );
      return null;
    }
  }

  async createBulk(
    userIds: string[],
    payload: Omit<CreateNotificationPayload, 'user_id'>,
  ) {
    const results = await Promise.all(
      userIds.map((uid) => this.create({ ...payload, user_id: uid })),
    );
    return results.filter(Boolean);
  }

  async getAll(userId: string, limit = 50) {
    const notifications = await this.prisma.notifications.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return { data: notifications, message: 'Berhasil' };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notifications.count({
      where: { user_id: userId, is_read: false },
    });
    return { data: { count }, message: 'Berhasil' };
  }

  async markRead(notifId: string, userId: string) {
    const existing = await this.prisma.notifications.findUnique({
      where: { id: notifId },
    });
    if (!existing) {
      throw new NotFoundException('Notifikasi tidak ditemukan');
    }
    if (existing.user_id !== userId) {
      throw new NotFoundException('Notifikasi tidak ditemukan');
    }

    if (existing.is_read) {
      return { data: existing, message: 'Berhasil' };
    }

    const updated = await this.prisma.notifications.update({
      where: { id: notifId },
      data: { is_read: true, read_at: new Date() },
    });

    try {
      const { data } = await this.getUnreadCount(userId);
      await this.gateway.pushUnreadCount(userId, data.count);
    } catch (_) {}

    return { data: updated, message: 'Berhasil' };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true, read_at: new Date() },
    });

    try {
      await this.gateway.pushUnreadCount(userId, 0);
    } catch (_) {}

    return {
      data: { count: result.count },
      message: 'Semua notifikasi ditandai dibaca',
    };
  }

  async delete(notifId: string, userId: string) {
    const existing = await this.prisma.notifications.findUnique({
      where: { id: notifId },
    });
    if (!existing || existing.user_id !== userId) {
      throw new NotFoundException('Notifikasi tidak ditemukan');
    }
    await this.prisma.notifications.delete({ where: { id: notifId } });
    return { data: null, message: 'Notifikasi dihapus' };
  }
}
