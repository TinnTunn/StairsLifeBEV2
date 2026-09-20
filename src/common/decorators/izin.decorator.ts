// Dekorator penanda izin admin yang dibutuhkan sebuah endpoint.

import { SetMetadata } from '@nestjs/common';

export const IZIN_ADMIN = [
  'Overview',
  'Projects',
  'Users',
  'Verification',
  'Disputes',
  'Finance',
  'Support',
  'Announcement',
  'Settings',
] as const;

export type IzinAdmin = (typeof IZIN_ADMIN)[number];

export const KUNCI_IZIN = 'izin_admin';

export const Izin = (izin: IzinAdmin) => SetMetadata(KUNCI_IZIN, izin);
