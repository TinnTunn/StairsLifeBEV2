import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IzinAdminGuard } from './izin-admin.guard';
import type { SupabaseService } from '../../config/supabase.config';

type Peran = { name: string; permissions: string[]; members: string[]; is_system: boolean };

function buatGuard(peran: Peran[], perlu: string | undefined) {
  const supabase = {
    getClient: () => ({
      from: () => ({ select: async () => ({ data: peran, error: null }) }),
    }),
  } as unknown as SupabaseService;
  const reflector = { getAllAndOverride: () => perlu } as unknown as Reflector;
  return new IzinAdminGuard(reflector, supabase);
}

function konteks(user: { id: string; email: string; role: string }) {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const admin = { id: 'a1', email: 'ops@contoh.id', role: 'admin' };

describe('IzinAdminGuard', () => {
  beforeEach(() => IzinAdminGuard.bersihkanCache());

  it('admin yang tidak tercantum di peran mana pun punya akses penuh', async () => {
    const guard = buatGuard([{ name: 'Admin', permissions: ['Users'], members: ['Ops Admin'], is_system: false }], 'Finance');
    await expect(guard.canActivate(konteks(admin))).resolves.toBe(true);
  });

  it('anggota peran hanya boleh membuka modul yang diizinkan', async () => {
    const peran = [{ name: 'Moderator', permissions: ['Users'], members: ['ops@contoh.id'], is_system: false }];
    await expect(buatGuard(peran, 'Users').canActivate(konteks(admin))).resolves.toBe(true);
    IzinAdminGuard.bersihkanCache();
    await expect(buatGuard(peran, 'Finance').canActivate(konteks(admin))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('peran sistem selalu akses penuh', async () => {
    const peran = [{ name: 'Super Admin', permissions: [], members: ['a1'], is_system: true }];
    await expect(buatGuard(peran, 'Settings').canActivate(konteks(admin))).resolves.toBe(true);
  });

  it('non-admin dan endpoint tanpa @Izin dilewatkan', async () => {
    const peran = [{ name: 'X', permissions: [], members: ['a1'], is_system: false }];
    await expect(buatGuard(peran, undefined).canActivate(konteks(admin))).resolves.toBe(true);
    await expect(
      buatGuard(peran, 'Finance').canActivate(konteks({ id: 'm1', email: 'm@contoh.id', role: 'mahasiswa' })),
    ).resolves.toBe(true);
  });
});
