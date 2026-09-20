// Uji unit logika ulasan.

import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('_autoUpgradeTier', () => {
    const naik = (
      id: string,
      proyek: number,
      rating: number,
      tier: string,
    ): Promise<{ from: string; to: string } | null> =>
      (service as any)._autoUpgradeTier.call(
        { prisma: { users: { update: jest.fn().mockResolvedValue({}) } } },
        id,
        proyek,
        rating,
        tier,
      );

    it('menaikkan ke menengah setelah 3 proyek dengan rating 4,0', async () => {
      await expect(naik('u1', 3, 4.0, 'pemula')).resolves.toEqual({
        from: 'pemula',
        to: 'menengah',
      });
    });

    it('menaikkan ke mahir setelah 10 proyek dengan rating 4,5', async () => {
      await expect(naik('u1', 10, 4.5, 'menengah')).resolves.toEqual({
        from: 'menengah',
        to: 'mahir',
      });
    });

    it('tidak menurunkan tier saat rating turun', async () => {
      await expect(naik('u1', 12, 3.9, 'mahir')).resolves.toBeNull();
      await expect(naik('u1', 4, 3.2, 'menengah')).resolves.toBeNull();
    });

    it('belum menaikkan sebelum ambangnya tercapai', async () => {
      await expect(naik('u1', 2, 5, 'pemula')).resolves.toBeNull();
      await expect(naik('u1', 9, 4.4, 'menengah')).resolves.toBeNull();
    });
  });
});
