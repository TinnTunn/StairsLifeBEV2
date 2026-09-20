# StairsLife Backend

API untuk StairsLife, marketplace proyek freelance yang mempertemukan mahasiswa
Indonesia dengan UMKM. Dana klien ditahan di escrow sampai hasil kerja disetujui,
lalu dilepas ke dompet mahasiswa dikurangi komisi platform.

Frontendnya ada di repositori terpisah: [StairsLifeFEV2](https://github.com/TinnTunn/StairsLifeFEV2).

## Teknologi

NestJS 11, Prisma 7 dengan adapter Postgres, Supabase untuk basis data dan
penyimpanan berkas, Xendit untuk invoice dan pencairan dana, Resend untuk email,
Socket.IO untuk obrolan dan notifikasi waktu nyata. Node 20 ke atas.

## Menjalankan di mesin sendiri

```bash
npm install
cp .env.example .env
```

Isi `.env` mengikuti keterangan di dalamnya. Yang wajib ada sebelum server bisa
dipakai: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`JWT_SECRET`, dan `JWT_REFRESH_SECRET`.

Terapkan skema basis datanya lebih dulu, lihat bagian Migrasi di bawah. Sesudah itu:

```bash
npm run start:dev
```

Server jalan di `http://localhost:3000` dengan prefix `/api/v1`.

`GET /api/v1` sendiri mengembalikan 404 karena tidak ada rute akar. Untuk
memastikan server hidup, pakai `GET /api/v1/settings/public`: tanpa penjaga
autentikasi dan membaca basis data, jadi statusnya sekaligus membuktikan
koneksi Supabase bekerja.

## Migrasi basis data

**Repositori ini tidak memakai `prisma migrate`.** Blok `datasource db` di
`prisma/schema.prisma` tidak memuat `url`, dan berkas di `prisma/migrations/`
adalah SQL yang ditulis tangan, bukan keluaran Prisma.

Cara menerapkannya: buka Supabase, masuk ke SQL Editor, tempel isi berkasnya,
jalankan. Untuk basis data baru mulai dari `sprint_full_schema.sql`.

`dev_clear_chat_history.sql` adalah alat bantu pengembangan yang menghapus
riwayat obrolan. Jangan dijalankan di produksi.

Menambahkan `prisma migrate deploy` ke perintah build akan gagal, karena tidak
ada `url` yang bisa dibacanya.

## Struktur

17 modul di `src/modules`, 109 endpoint:

| Modul | Isi |
|---|---|
| `auth` | Daftar, masuk, token akses dan penyegar, verifikasi email, atur ulang kata sandi, banding akun |
| `users` | Profil, portofolio, pengajuan verifikasi mahasiswa |
| `projects` | Pemasangan proyek, penyaringan, perubahan status |
| `applications` | Lamaran, penerimaan, penolakan otomatis lamaran lain |
| `contracts` | Kontrak, hasil kerja, persetujuan, pelepasan dana |
| `payments` | Invoice Xendit, escrow, komisi platform, webhook |
| `withdrawals` | Saldo dompet (`GET /withdrawals/wallet`), pengajuan penarikan, pencairan Xendit |
| `bank-accounts` | Rekening tujuan penarikan |
| `reviews` | Ulasan dan rata rata penilaian |
| `disputes` | Sengketa dan mediasinya |
| `chat` | Obrolan kontrak, tanya jawab, dukungan, penanda dibaca |
| `notifications` | Notifikasi dalam aplikasi |
| `admin` | Panel admin, peran dan izin, jejak audit |
| `settings` | Pengaturan platform seperti komisi dan batas penarikan |
| `upload` | Unggah berkas ke penyimpanan Supabase |
| `email` | Pengiriman email lewat Resend |
| `xendit` | Klien invoice dan pencairan dana |

Di luar itu, `src/common` berisi penjaga peran dan izin, filter galat, serta
interceptor yang membungkus respons.

## Bentuk respons

Setiap respons sukses dibungkus seragam:

```json
{ "success": true, "data": {}, "message": "Berhasil", "timestamp": "..." }
```

Respons gagal membawa `statusCode` dan `code` yang stabil, supaya frontend bisa
memetakannya ke pesan sendiri tanpa mencocokkan teks.

Validasi memakai `forbidNonWhitelisted`, jadi satu field asing dalam badan
permintaan menghasilkan 400, bukan diabaikan diam diam.

## WebSocket

Dua namespace, keduanya butuh token JWT saat menyambung:

- `/chat` untuk pesan waktu nyata
- `/notifications` untuk dorongan notifikasi, satu room per pengguna

Whitelist origin keduanya berasal dari `FRONTEND_URL` lewat
`src/common/cors.util.ts`, sumber yang sama dengan CORS REST. Nilainya dihitung
sekali saat proses dimulai, jadi perubahan `FRONTEND_URL` butuh restart.

## Uji

```bash
npm test
```

14 suite, 42 uji lolos, 2 dilewati.

## Penyebaran

Sudah disiapkan untuk Railway: aplikasi mendengarkan di `0.0.0.0` dan memakai
`process.env.PORT`, jadi `PORT` tidak perlu diisi sendiri.

| Kolom | Nilai |
|---|---|
| Build command | `npm ci && npm run build` |
| Start command | `npm run start:prod` |
| Healthcheck path | `/api/v1/settings/public` |

Seluruh variabel di `.env.example` perlu diisi, dengan `NODE_ENV=production`.
`DATABASE_URL` harus memakai Session pooler Supabase: koneksi langsung hanya
menyediakan alamat IPv6 dan tidak terjangkau dari Railway, dan gejalanya muncul
sebagai 500 di setiap endpoint yang membaca data, bukan sebagai kegagalan build.

Di dashboard Xendit, daftarkan **dua** webhook, bukan satu:

| Kejadian | URL |
|---|---|
| Invoice | `https://DOMAIN/api/v1/payments/webhook/xendit` |
| Disbursement | `https://DOMAIN/api/v1/withdrawals/webhook/xendit` |

Kalau hanya yang pertama didaftarkan, pembayaran berjalan normal tetapi
penarikan dana berhenti di status `processing` selamanya.

## Keamanan

`SUPABASE_SERVICE_ROLE_KEY` melewati seluruh aturan row level security, dan
`JWT_SECRET` bisa dipakai menerbitkan token atas nama pengguna mana pun termasuk
admin. Keduanya hanya boleh hidup di variabel lingkungan server.

Berkas `.env` dan seluruh turunannya diabaikan `.gitignore`, termasuk salinan
cadangan. Hanya `.env.example` yang boleh ikut ke repositori, dan isinya nama
variabel tanpa nilai.

Mengganti `JWT_SECRET` mencabut seluruh sesi yang sedang berjalan.
