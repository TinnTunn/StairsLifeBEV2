import { SetMetadata } from '@nestjs/common';

/**
 * Modul panel admin. Nama mengikuti data `admin_roles.permissions` yang sudah
 * ada sejak FE V2 (Overview, Projects, ...), ditambah Finance untuk uang.
 */
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

/** @Izin('Finance') — admin harus punya izin modul ini. */
export const Izin = (izin: IzinAdmin) => SetMetadata(KUNCI_IZIN, izin);
