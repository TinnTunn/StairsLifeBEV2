// Logika ulasan dan perhitungan rata rata penilaian.

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(reviewerId: string, dto: CreateReviewDto) {
    const { contract_id, rating, comment, tags } = dto;

    const contract = await this.prisma.contracts.findFirst({
      where: {
        id: contract_id,
        status: 'completed',
        OR: [{ business_id: reviewerId }, { student_id: reviewerId }],
      },
      include: { projects: { select: { title: true } } },
    });
    if (!contract)
      throw new NotFoundException('Kontrak tidak ditemukan atau belum selesai');

    const actualRevieweeId =
      reviewerId === contract.business_id
        ? contract.student_id
        : contract.business_id;

    const existing = await this.prisma.reviews.findFirst({
      where: { contract_id, reviewer_id: reviewerId },
    });
    if (existing)
      throw new BadRequestException(
        'Kamu sudah pernah memberikan review untuk kontrak ini',
      );

    const review = await this.prisma.reviews.create({
      data: {
        contract_id,
        reviewer_id: reviewerId,
        reviewee_id: actualRevieweeId,
        rating,
        comment: comment || null,
        tags: tags || [],
      },
    });

    const allReviews = await this.prisma.reviews.findMany({
      where: { reviewee_id: actualRevieweeId },
      select: { rating: true },
    });
    const avg =
      allReviews.reduce((s, r) => s + (r.rating || 0), 0) / allReviews.length;
    const updatedReviewee = await this.prisma.users.update({
      where: { id: actualRevieweeId },
      data: { rating_avg: avg },
    });

    let tierUpgrade: { from: string; to: string } | null = null;
    if (updatedReviewee.role === 'mahasiswa') {
      tierUpgrade = await this._autoUpgradeTier(
        updatedReviewee.id,
        updatedReviewee.total_projects ?? 0,
        Number(updatedReviewee.rating_avg ?? 0),
        updatedReviewee.tier ?? 'pemula',
      );
    }

    const reviewer = await this.prisma.users.findUnique({
      where: { id: reviewerId },
      select: { full_name: true },
    });
    const stars = '⭐'.repeat(rating);
    void this.notificationsService.create({
      user_id: actualRevieweeId,
      type: 'review',
      title: `${stars} Review Baru`,
      body: `${reviewer?.full_name || 'Klien'} memberi rating ${rating}/5 untuk project "${contract.projects?.title || 'kamu'}".${comment ? ` "${comment.slice(0, 60)}${comment.length > 60 ? '...' : ''}"` : ''}`,
      ref_id: contract.id,
      action_url: `/profile`,
    });

    if (tierUpgrade) {
      void this.notificationsService.create({
        user_id: actualRevieweeId,
        type: 'system',
        title: '🎖️ Tier Naik!',
        body: `Selamat! Tier kamu naik dari ${tierUpgrade.from} ke ${tierUpgrade.to}. Akses project lebih besar terbuka.`,
        ref_id: actualRevieweeId,
        action_url: `/profile`,
      });
    }

    return { data: review, message: 'Review berhasil diberikan' };
  }

  private async _autoUpgradeTier(
    studentId: string,
    totalProjects: number,
    avgRating: number,
    currentTier: string,
  ): Promise<{ from: string; to: string } | null> {
    const urutan = { pemula: 0, menengah: 1, mahir: 2 } as const;
    let hitungan: 'pemula' | 'menengah' | 'mahir' = 'pemula';
    if (totalProjects >= 10 && avgRating >= 4.5) {
      hitungan = 'mahir';
    } else if (totalProjects >= 3 && avgRating >= 4.0) {
      hitungan = 'menengah';
    }
    const sekarang = (
      currentTier in urutan ? currentTier : 'pemula'
    ) as keyof typeof urutan;
    const newTier = urutan[hitungan] > urutan[sekarang] ? hitungan : sekarang;
    if (newTier !== sekarang) {
      await this.prisma.users.update({
        where: { id: studentId },
        data: { tier: newTier as any },
      });
      return { from: sekarang, to: newTier };
    }
    return null;
  }

  async getByContract(contractId: string) {
    const reviews = await this.prisma.reviews.findMany({
      where: { contract_id: contractId },
      include: {
        users_reviews_reviewer_idTousers: {
          select: { id: true, full_name: true, role: true, avatar_url: true },
        },
        users_reviews_reviewee_idTousers: {
          select: { id: true, full_name: true, role: true, avatar_url: true },
        },
      },
    });
    return { data: reviews, message: 'Berhasil' };
  }

  async getByUser(userId: string) {
    const reviews = await this.prisma.reviews.findMany({
      where: { reviewee_id: userId },
      include: {
        users_reviews_reviewer_idTousers: {
          select: { id: true, full_name: true, avatar_url: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return { data: reviews, message: 'Berhasil' };
  }
}
