// Peta pesan galat ke kode yang stabil untuk dibaca frontend.

export interface KodeGalat {
  code: string;
  params?: Record<string, string | number>;
}

type Pola = [RegExp, string, ((m: RegExpMatchArray) => KodeGalat['params'])?];

const rupiah = (s: string) => Number(s.replace(/\D/g, ''));

const POLA: Pola[] = [
  [/^Email atau password salah$/, 'INVALID_CREDENTIALS'],
  [/^Akun ini belum memiliki password/, 'PASSWORD_NOT_SET'],
  [/^Email sudah terdaftar$/, 'EMAIL_TAKEN'],
  [/^Akun di-suspend$/, 'ACCOUNT_SUSPENDED'],
  [/^Refresh token/, 'SESSION_INVALID'],
  [/^Token bukan refresh token$/, 'SESSION_INVALID'],
  [/^Link reset password tidak valid/, 'RESET_LINK_INVALID'],
  [/^Link verifikasi tidak valid/, 'VERIFY_LINK_INVALID'],
  [/^Pendaftaran gagal/, 'REGISTER_FAILED'],
  [/^Role tidak valid/, 'ROLE_INVALID'],
  [/^Akses ditolak\. Diperlukan role/, 'ROLE_REQUIRED'],
  [/^Password minimal 8 karakter$/, 'PASSWORD_TOO_SHORT'],

  [/^Project tidak ditemukan$/, 'PROJECT_NOT_FOUND'],
  [/^Project sudah tidak menerima lamaran$/, 'PROJECT_CLOSED'],
  [/^Project ini sudah punya kandidat terpilih/, 'PROJECT_HAS_CANDIDATE'],
  [/^Project ini sudah punya kontrak/, 'PROJECT_HAS_CONTRACT'],
  [/^Kamu sudah pernah melamar project ini$/, 'APPLICATION_DUPLICATE'],
  [/^Lamaran tidak ditemukan$/, 'APPLICATION_NOT_FOUND'],
  [
    /^Lamaran berstatus "(\w+)" tidak bisa dibatalkan/,
    'APPLICATION_NOT_CANCELLABLE',
    (m) => ({ status: m[1] }),
  ],
  [/^Lamaran harus di-approve dulu$/, 'APPLICATION_NOT_APPROVED'],

  [/^Kontrak tidak ditemukan/, 'CONTRACT_NOT_FOUND'],
  [/^Kontrak tidak dalam status aktif$/, 'CONTRACT_NOT_ACTIVE'],
  [
    /^Kontrak tidak dalam status pending review$/,
    'CONTRACT_NOT_PENDING_REVIEW',
  ],
  [
    /^Kontrak berstatus (\w+) tidak bisa dibayar$/,
    'CONTRACT_NOT_PAYABLE',
    (m) => ({ status: m[1] }),
  ],
  [/^Minimal 1 file harus diupload$/, 'DELIVERABLE_FILE_REQUIRED'],
  [/^Pembayaran untuk kontrak ini sudah/, 'PAYMENT_EXISTS'],
  [/^Dana tidak dalam status escrow/, 'PAYMENT_NOT_HELD'],
  [/^Kamu sudah pernah memberikan review/, 'REVIEW_DUPLICATE'],
  [
    /^Gagal koneksi ke Xendit|^Gateway pembayaran menolak|^Xendit belum dikonfigurasi/,
    'PAYMENT_GATEWAY_ERROR',
  ],

  [/^(Sengketa|Dispute) tidak ditemukan$/, 'DISPUTE_NOT_FOUND'],
  [/^Sengketa sudah ditutup/, 'DISPUTE_CLOSED'],
  [/^Reason minimal 20 karakter$/, 'DISPUTE_REASON_TOO_SHORT'],
  [/^Hanya pihak yang membuka sengketa/, 'DISPUTE_NOT_OPENER'],

  [
    /^Minimal penarikan Rp ([\d.]+)/,
    'WITHDRAWAL_BELOW_MIN',
    (m) => ({ amount: rupiah(m[1]) }),
  ],
  [
    /^Nominal harus lebih besar dari biaya admin Rp ([\d.]+)/,
    'WITHDRAWAL_BELOW_FEE',
    (m) => ({ amount: rupiah(m[1]) }),
  ],
  [/^Saldo belum tersedia/, 'WALLET_EMPTY'],
  [
    /^Saldo tidak cukup\. Tersedia: Rp ([\d.]+)/,
    'WALLET_INSUFFICIENT',
    (m) => ({ amount: rupiah(m[1]) }),
  ],
  [/^Saldo tidak cukup atau berubah/, 'WALLET_CHANGED'],
  [/^Nomor rekening ini sudah terdaftar$/, 'BANK_ACCOUNT_DUPLICATE'],
  [/^Rekening tidak ditemukan$/, 'BANK_ACCOUNT_NOT_FOUND'],
  [/^Rekening sedang dipakai/, 'BANK_ACCOUNT_IN_USE'],

  [/^Ukuran file maksimal/, 'FILE_TOO_LARGE'],
  [/^Type tidak valid/, 'FILE_TYPE_INVALID'],
  [/^File tidak ditemukan dalam request/, 'FILE_REQUIRED'],

  [/^Belum ada kontrak antara kamu dan user ini/, 'CHAT_NEEDS_CONTRACT'],
  [/^User ini sedang disuspend$/, 'USER_SUSPENDED'],
  [/^Tidak bisa chat dengan diri sendiri$/, 'CHAT_SELF'],

  [/^User tidak ditemukan$/, 'USER_NOT_FOUND'],
  [
    /^Kamu tidak punya akses|^Tidak punya akses$|^Akses ditolak\.?$/,
    'FORBIDDEN',
  ],
];

const PER_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'FILE_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};

export function tentukanKode(status: number, message: unknown): KodeGalat {
  if (Array.isArray(message)) {
    for (const m of message) {
      const kode = cocokkan(String(m));
      if (kode) return kode;
    }
    return { code: 'VALIDATION_FAILED' };
  }
  if (typeof message === 'string') {
    if (message.startsWith('{')) {
      try {
        const isi = JSON.parse(message) as { suspended?: boolean };
        if (isi.suspended) return { code: 'ACCOUNT_SUSPENDED' };
      } catch {
        /* bukan JSON */
      }
    }
    const kode = cocokkan(message);
    if (kode) return kode;
  }
  return {
    code: PER_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : 'UNKNOWN'),
  };
}

function cocokkan(message: string): KodeGalat | null {
  for (const [re, code, params] of POLA) {
    const m = message.match(re);
    if (m) return params ? { code, params: params(m) } : { code };
  }
  return null;
}
