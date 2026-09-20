# Menyebarkan backend StairsLife ke Railway

Panduan ini khusus untuk repositori ini apa adanya: NestJS 11, Prisma 7 dengan adapter
Postgres, basis data Supabase, dan Xendit sebagai gerbang pembayaran. Semua nilai yang
perlu diisi disebut namanya; tidak ada satu pun rahasia yang ditulis di berkas ini.

Urutannya penting. Beberapa variabel baru bisa diisi setelah Railway memberi domain,
jadi ada dua kali pengisian variabel.

---

## 0. Sebelum mulai

Siapkan dulu, karena semuanya dibutuhkan di tengah jalan:

- Akun Railway yang sudah tersambung ke akun GitHub.
- Repositori backend ini sudah ada di GitHub.
- Dari Supabase: `Project Settings > Database > Connection string`, mode **Session pooler**,
  dan `Project Settings > API` untuk URL proyek serta `service_role key`.
- Dari Xendit: `Secret key` dan `Callback verification token` (Settings > Developers).
- Dari Resend: API key dan satu alamat pengirim yang domainnya sudah terverifikasi.
- Alamat frontend di Vercel, misalnya `https://app.stairslife.id`.

> Kalau domain frontend belum final, pakai dulu domain `*.vercel.app` bawaan, lalu ubah
> `FRONTEND_URL` saat domain sendiri sudah jadi. Mengubahnya butuh redeploy.

---

## 1. Buat layanan di Railway

1. Railway > **New Project** > **Deploy from GitHub repo**.
2. Pilih repositori backend ini.
3. Kalau backend tidak berada di akar repositori, buka **Settings > Root Directory** dan
   isi dengan foldernya.
4. Biarkan build gagal atau tertahan dulu. Variabel belum ada, jadi memang belum bisa jalan.

---

## 2. Perintah build dan start

Railway biasanya mendeteksi ini sendiri dari `package.json`. Periksa di
**Settings > Deploy**, dan isi manual kalau kosong:

| Kolom | Nilai |
|---|---|
| Build command | `npm ci && npm run build` |
| Start command | `npm run start:prod` |

`npm run build` menjalankan `prisma generate && nest build`, jadi Prisma Client ikut
dibuat setiap deploy. Ini wajib: Prisma Client tidak ikut masuk repositori.

`package.json` sudah memuat `engines.node` `>=20`, jadi Railway tidak akan memilih Node
yang terlalu lama.

**Jangan** memasang perintah `prisma migrate deploy`. Lihat bagian 6.

---

## 3. Variabel lingkungan, tahap pertama

**Variables > Raw Editor**, lalu isi berikut. Kolom "wajib" berarti aplikasinya tidak
berjalan benar tanpa itu.

| Variabel | Wajib | Isi |
|---|---|---|
| `NODE_ENV` | ya | `production` |
| `DATABASE_URL` | ya | Connection string Supabase, mode Session pooler, lengkap dengan `?sslmode=require` |
| `SUPABASE_URL` | ya | URL proyek Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Service role key Supabase, bukan anon key |
| `JWT_SECRET` | ya | Acak, minimal 32 karakter |
| `JWT_REFRESH_SECRET` | ya | Acak, minimal 32 karakter, **berbeda** dari `JWT_SECRET` |
| `JWT_EXPIRES_IN` | ya | `60m` |
| `JWT_REFRESH_EXPIRES_IN` | ya | `7d` |
| `XENDIT_SECRET_KEY` | ya | Secret key Xendit |
| `XENDIT_CALLBACK_TOKEN` | ya | Callback verification token Xendit |
| `RESEND_API_KEY` | ya | API key Resend |
| `EMAIL_FROM` | ya | Alamat pengirim pada domain yang sudah diverifikasi Resend |
| `WITHDRAWAL_MIN_AMOUNT` | tidak | Minimal penarikan dalam rupiah, misalnya `50000` |
| `WITHDRAWAL_ADMIN_FEE` | tidak | Biaya admin penarikan, misalnya `2500` |
| `PORT` | tidak | **Jangan diisi.** Railway menyuntikkannya sendiri |

`FRONTEND_URL` dan `APP_URL` sengaja belum diisi; keduanya masuk di tahap kedua.

Membuat nilai acak untuk kedua JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Jalankan dua kali dan pakai hasil yang berbeda untuk masing-masing. Menyamakan keduanya
membuat refresh token bisa dipakai sebagai access token.

### Kenapa Session pooler, bukan koneksi langsung

Koneksi langsung Supabase hanya menyediakan alamat IPv6, sedangkan jaringan keluar
Railway memakai IPv4. Memakai connection string langsung akan berhenti di
`ENETUNREACH` saat permintaan pertama menyentuh basis data, bukan saat build, jadi
gejalanya muncul sebagai 500 di endpoint mana pun yang membaca data.

---

## 4. Domain

**Settings > Networking > Generate Domain**, atau pasang domain sendiri. Hasilnya
misalnya `https://stairslife-api.up.railway.app`.

Aplikasi sudah mendengarkan di `0.0.0.0` dan memakai `process.env.PORT`, jadi tidak ada
yang perlu diubah di kode.

Seluruh endpoint berada di bawah prefix `/api/v1`.

---

## 5. Variabel lingkungan, tahap kedua

Setelah domain frontend dan backend sama sama diketahui:

| Variabel | Isi |
|---|---|
| `FRONTEND_URL` | Alamat frontend, tanpa garis miring di akhir, misalnya `https://app.stairslife.id` |
| `APP_URL` | Sama dengan `FRONTEND_URL`. Dipakai menyusun tautan di dalam email |

`FRONTEND_URL` boleh memuat beberapa alamat dipisah koma, misalnya domain produksi
ditambah domain pratinjau Vercel:

```
https://app.stairslife.id,https://stairslife.vercel.app
```

Nilai ini dibaca **tiga** tempat sekaligus lewat `src/common/cors.util.ts`: CORS REST,
gateway WebSocket `/chat`, dan gateway WebSocket `/notifications`. Daftarnya dihitung
sekali saat proses dimulai, jadi setiap perubahan butuh redeploy, bukan sekadar
restart cepat.

Kalau `FRONTEND_URL` salah, gejalanya bukan halaman error melainkan permintaan yang
diblokir peramban dengan pesan CORS, dan obrolan waktu nyata yang diam tanpa keluhan.

---

## 6. Migrasi basis data

**Proyek ini tidak memakai `prisma migrate`.** Blok `datasource db` di
`prisma/schema.prisma` tidak memuat `url`, dan berkas di `prisma/migrations/` adalah SQL
yang ditulis tangan, bukan migrasi yang dihasilkan Prisma.

Cara menerapkannya: buka **Supabase > SQL Editor**, tempel isi berkasnya, jalankan.
Urutkan dari `sprint_full_schema.sql` untuk basis data yang benar benar baru.

`dev_clear_chat_history.sql` adalah alat bantu pengembangan yang menghapus riwayat
obrolan. Jangan pernah menjalankannya di produksi.

Menambahkan `prisma migrate deploy` ke perintah build akan gagal, karena tidak ada
`url` yang bisa dibacanya.

---

## 7. Webhook Xendit

Ada **dua** endpoint, dan keduanya perlu didaftarkan di dashboard Xendit
(Settings > Developers > Webhooks):

| Kejadian | URL |
|---|---|
| Invoice paid / expired | `https://DOMAIN-RAILWAY/api/v1/payments/webhook/xendit` |
| Disbursement | `https://DOMAIN-RAILWAY/api/v1/withdrawals/webhook/xendit` |

Keduanya memeriksa header `x-callback-token` terhadap `XENDIT_CALLBACK_TOKEN`. Kalau
nilainya tidak cocok, permintaan ditolak dan pembayaran yang sudah lunas tidak akan
pernah tercatat masuk escrow.

Hanya mendaftarkan yang pertama adalah kesalahan yang paling mudah terjadi: pembayaran
akan berjalan normal, tetapi penarikan dana berhenti di status `processing` selamanya
karena konfirmasi disbursement tidak pernah sampai.

---

## 8. Healthcheck

Repositori ini tidak punya endpoint `/health`. `GET /api/v1` mengembalikan 404, jadi
jangan dipakai sebagai healthcheck.

Yang bisa dipakai adalah `GET /api/v1/settings/public`: tanpa penjaga autentikasi,
membaca basis data, jadi statusnya juga membuktikan koneksi Supabase hidup.

**Settings > Deploy > Healthcheck Path**: `/api/v1/settings/public`

---

## 9. Menyambungkan frontend di Vercel

Di Vercel, **Settings > Environment Variables**:

| Variabel | Isi |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://DOMAIN-RAILWAY/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | Alamat frontend sendiri |
| `NEXT_PUBLIC_USE_MOCK` | `0` |

Ketiganya dibekukan ke dalam bundel saat build, bukan dibaca saat dijalankan, jadi
mengubahnya mengharuskan build ulang. `scripts/cek-produksi.mjs` di repositori frontend
menghentikan build kalau salah satunya kosong, memakai http, atau masih menunjuk
localhost.

`NEXT_PUBLIC_API_BASE_URL` harus berakhir `/api/v1` dan tanpa garis miring di akhir.

---

## 10. Memastikan penyebarannya benar

Jalankan berurutan setelah deploy pertama.

```bash
curl -i https://DOMAIN-RAILWAY/api/v1/settings/public
```

Harus 200 dan memuat `platform_fee` serta `withdrawal_min_amount`. Kalau 500, hampir
selalu `DATABASE_URL` yang salah mode.

```bash
curl -i -X OPTIONS https://DOMAIN-RAILWAY/api/v1/projects \
  -H "Origin: https://DOMAIN-FRONTEND" \
  -H "Access-Control-Request-Method: GET"
```

Harus memuat `access-control-allow-origin` yang cocok dengan domain frontend. Kalau
kosong, `FRONTEND_URL` belum benar.

```bash
curl -i -X POST https://DOMAIN-RAILWAY/api/v1/payments/webhook/xendit \
  -H "Content-Type: application/json" -d "{}"
```

Harus 403 `Invalid callback token`, bukan 500. Tertolak berarti pemeriksaan
`x-callback-token` bekerja. Kedua endpoint webhook memakai `@SkipThrottle()`, jadi
Xendit tidak akan kena pembatasan laju saat mengirim ulang.

Terakhir, buka frontend dan masuk sebagai admin. Kalau notifikasi dan obrolan bergerak
tanpa perlu memuat ulang halaman, kedua gateway WebSocket sudah lolos CORS.

---

## 11. Yang paling sering gagal

| Gejala | Penyebab |
|---|---|
| Build gagal di `npm ci` | `package-lock.json` tidak sejalan dengan `package.json` |
| 500 di semua endpoint yang membaca data | `DATABASE_URL` memakai koneksi langsung, bukan Session pooler |
| Peramban memblokir dengan pesan CORS | `FRONTEND_URL` kosong, salah, atau berakhir garis miring |
| Obrolan dan notifikasi diam, REST normal | `FRONTEND_URL` benar tapi belum redeploy setelah diubah |
| Pembayaran lunas tapi escrow kosong | `XENDIT_CALLBACK_TOKEN` tidak cocok, atau URL webhook salah |
| Penarikan berhenti di `processing` | Webhook disbursement belum didaftarkan |
| Email tidak terkirim | Domain `EMAIL_FROM` belum diverifikasi di Resend |
| Token ditolak setelah deploy ulang | `JWT_SECRET` berubah; semua sesi lama memang menjadi tidak sah |

---

## 12. Catatan keamanan

- `SUPABASE_SERVICE_ROLE_KEY` melewati seluruh aturan row level security. Kunci ini
  hanya boleh ada di Railway, tidak pernah di frontend.
- `.env` tidak ikut ke repositori. Variabel produksi hanya hidup di Railway.
- Mengganti `JWT_SECRET` adalah cara mencabut seluruh sesi sekaligus kalau suatu saat
  dibutuhkan.
