import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SupabaseService } from '../../config/supabase.config';
import { IZIN_ADMIN, KUNCI_IZIN, type IzinAdmin } from '../decorators/izin.decorator';
import type { JwtUser } from '../types/jwt-payload.type';

const CACHE_MS = 30_000;

export interface AksesAdmin {
  /** true: tidak dibatasi (peran sistem, atau belum masuk peran mana pun). */
  penuh: boolean;
  izin: IzinAdmin[];
  peran: string[];
}

/**
 * Menegakkan `admin_roles` yang sebelumnya hanya disimpan.
 *
 * Aturan:
 * - Anggota peran dicocokkan dengan id atau email admin. Data lama menyimpan
 *   nama tampilan ("Ops Admin") yang tidak menunjuk akun apa pun.
 * - Admin yang tidak tercantum di peran mana pun memiliki akses penuh. Ini
 *   menjaga admin yang sudah ada tetap bisa bekerja; pembatasan berlaku begitu
 *   admin dimasukkan ke peran.
 * - Peran sistem (`is_system`, mis. Super Admin) selalu akses penuh.
 * - Selain itu, izin = gabungan izin semua peran tempat admin tercantum.
 *
 * Dipasang setelah JwtAuthGuard dan RolesGuard; pengguna non-admin dilewatkan
 * karena RolesGuard sudah memutuskan akses mereka.
 */
@Injectable()
export class IzinAdminGuard implements CanActivate {
  private static cache = new Map<string, { akses: AksesAdmin; sampai: number }>();

  constructor(
    private reflector: Reflector,
    private supabase: SupabaseService,
  ) {}

  /** Dipanggil RolesService setelah peran berubah. */
  static bersihkanCache() {
    IzinAdminGuard.cache.clear();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const perlu = this.reflector.getAllAndOverride<IzinAdmin | undefined>(KUNCI_IZIN, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!perlu) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    const user = req.user;
    if (!user || user.role !== 'admin') return true;

    const akses = await this.aksesUntuk(user);
    if (akses.penuh || akses.izin.includes(perlu)) return true;

    throw new ForbiddenException({
      message: `Peran kamu tidak punya izin untuk modul ${perlu}`,
      code: 'ADMIN_PERMISSION_DENIED',
      params: { module: perlu },
    });
  }

  async aksesUntuk(user: JwtUser): Promise<AksesAdmin> {
    const now = Date.now();
    const tersimpan = IzinAdminGuard.cache.get(user.id);
    if (tersimpan && tersimpan.sampai > now) return tersimpan.akses;

    const { data, error } = await this.supabase
      .getClient()
      .from('admin_roles')
      .select('name, permissions, members, is_system');

    let akses: AksesAdmin;
    if (error) {
      // Tabel peran tidak terbaca: jangan kunci seluruh panel admin.
      akses = { penuh: true, izin: [...IZIN_ADMIN], peran: [] };
    } else {
      const email = (user.email ?? '').toLowerCase();
      const milik = (data ?? []).filter((r: { members?: string[] | null }) =>
        (r.members ?? []).some((m) => m === user.id || m.toLowerCase() === email),
      );
      const penuh = milik.length === 0 || milik.some((r: { is_system?: boolean }) => r.is_system);
      const izin = new Set<IzinAdmin>();
      for (const r of milik as Array<{ permissions?: string[] | null }>) {
        for (const p of r.permissions ?? []) {
          if ((IZIN_ADMIN as readonly string[]).includes(p)) izin.add(p as IzinAdmin);
        }
      }
      akses = {
        penuh,
        izin: penuh ? [...IZIN_ADMIN] : [...izin],
        peran: milik.map((r: { name: string }) => r.name),
      };
    }

    IzinAdminGuard.cache.set(user.id, { akses, sampai: now + CACHE_MS });
    return akses;
  }
}
