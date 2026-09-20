// Logika unggah berkas ke penyimpanan Supabase.

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type UploadType =
  | 'avatar'
  | 'ktm'
  | 'selfie'
  | 'deliverable'
  | 'evidence'
  | 'chat-image';

@Injectable()
export class UploadService {
  private readonly supabase: SupabaseClient;

  private readonly PUBLIC_BUCKET = 'stairslife-uploads'; // public  (avatars)
  private readonly PRIVATE_BUCKET = 'verification'; // private (ktm, selfie)
  private readonly DELIVERABLE_BUCKET = 'stairslife-private'; // private (deliverables)

  constructor(private readonly config: ConfigService) {
    this.supabase = createClient(
      this.config.get<string>('SUPABASE_URL'),
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async uploadFile(
    file: Express.Multer.File,
    type: UploadType,
    userId: string,
  ): Promise<string> {
    const { bucket, path } = this.resolvePath(type, userId, file.originalname);

    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Gagal upload ke Supabase: ${error.message}`,
      );
    }

    if (bucket === this.PUBLIC_BUCKET) {
      const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    }

    return path;
  }

  async getSignedUrl(
    path: string,
    requesterId: string,
    requesterRole: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    this.validatePathFormat(path);
    await this.authorizeSignedUrlAccess(path, requesterId, requesterRole);

    const isPrivateDeliverable =
      path.startsWith('deliverables/') || path.startsWith('evidence/');
    const bucket = isPrivateDeliverable
      ? this.DELIVERABLE_BUCKET
      : this.PRIVATE_BUCKET;

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds, {
        ...(isPrivateDeliverable ? { download: true } : {}),
      });

    if (error || !data) {
      throw new InternalServerErrorException('Gagal membuat signed URL.');
    }

    return data.signedUrl;
  }

  private validatePathFormat(path: string): void {
    const ok =
      /^(deliverables|ktm|selfie|evidence)\/[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]+$/.test(
        path,
      );
    if (!ok) {
      throw new BadRequestException('Path file tidak valid.');
    }
  }

  private async authorizeSignedUrlAccess(
    path: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<void> {
    if (requesterRole === 'admin') return;

    const segments = path.split('/');
    const folder = segments[0]; // 'deliverables', 'ktm', 'selfie'
    const ownerId = segments[1]; // userId

    if (folder === 'deliverables') {
      if (requesterId === ownerId) return;

      const allowed = await this.isDeliverableForBusiness(
        path,
        ownerId,
        requesterId,
      );
      if (!allowed) {
        throw new ForbiddenException('Akses ditolak.');
      }
    } else if (folder === 'evidence') {
      if (requesterId === ownerId) return;
      if (!(await this.isEvidenceForParty(path, requesterId))) {
        throw new ForbiddenException('Akses ditolak.');
      }
    } else {
      if (requesterId !== ownerId) {
        throw new ForbiddenException('Akses ditolak.');
      }
    }
  }

  private async isEvidenceForParty(
    path: string,
    requesterId: string,
  ): Promise<boolean> {
    const { data } = await this.supabase
      .from('disputes')
      .select('id, contracts:contracts!contract_id ( student_id, business_id )')
      .like('evidence_url', `%${path}%`)
      .limit(20);
    return (data ?? []).some((d) => {
      const c = d.contracts as unknown;
      const daftar = Array.isArray(c) ? c : c ? [c] : [];
      return daftar.some(
        (k) => k.student_id === requesterId || k.business_id === requesterId,
      );
    });
  }

  private async isDeliverableForBusiness(
    path: string,
    studentId: string,
    businessId: string,
  ): Promise<boolean> {
    const { data: c1 } = await this.supabase
      .from('contracts')
      .select('id')
      .eq('student_id', studentId)
      .eq('business_id', businessId)
      .like('deliverable_url', `%${path}%`)
      .limit(1);
    if (c1 && c1.length > 0) return true;

    const { data: hist } = await this.supabase
      .from('contract_deliverables')
      .select('contract_id')
      .like('deliverable_url', `%${path}%`);
    if (!hist || hist.length === 0) return false;

    const contractIds = hist.map((r: { contract_id: string }) => r.contract_id);
    const { data: c2 } = await this.supabase
      .from('contracts')
      .select('id')
      .in('id', contractIds)
      .eq('student_id', studentId)
      .eq('business_id', businessId)
      .limit(1);
    return !!(c2 && c2.length > 0);
  }

  private resolvePath(
    type: UploadType,
    userId: string,
    originalName: string,
  ): { bucket: string; path: string } {
    const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const routes: Record<UploadType, { bucket: string; folder: string }> = {
      avatar: { bucket: this.PUBLIC_BUCKET, folder: `avatars/${userId}` },
      deliverable: {
        bucket: this.DELIVERABLE_BUCKET,
        folder: `deliverables/${userId}`,
      },
      ktm: { bucket: this.PRIVATE_BUCKET, folder: `ktm/${userId}` },
      selfie: { bucket: this.PRIVATE_BUCKET, folder: `selfie/${userId}` },
      evidence: {
        bucket: this.DELIVERABLE_BUCKET,
        folder: `evidence/${userId}`,
      },
      'chat-image': { bucket: this.PUBLIC_BUCKET, folder: `chat/${userId}` },
    };

    const { bucket, folder } = routes[type];
    return { bucket, path: `${folder}/${unique}` };
  }

  validateFile(file: Express.Multer.File | undefined): void {
    if (!file) {
      throw new BadRequestException('File tidak ditemukan dalam request.');
    }
  }

  formatResponse(file: Express.Multer.File, url: string) {
    return {
      data: {
        url,
        file_name: file.originalname,
        size: file.size,
        mime_type: file.mimetype,
      },
      message: 'File berhasil diupload.',
    };
  }
}
