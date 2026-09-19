-- ============================================================
-- support_messages_is_read.sql
-- Tanda sudah dibaca untuk chat tanya jawab dan chat dukungan.
--
-- Tabel messages (chat kontrak) sudah punya is_read sejak awal, jadi centang
-- birunya menyala di sana. support_messages belum punya, sehingga frontend
-- tidak pernah menerima kabar "sudah dibaca" dan centangnya selamanya abu
-- walau lawan bicara jelas sudah membuka percakapannya.
--
-- Kolomnya nullable dengan default false supaya baris lama tetap sah tanpa
-- perlu diisi ulang, dan penambahan ini tidak mengunci tabel lama.
--
-- Jalankan di Supabase SQL Editor. Aman diulang.
-- ============================================================

ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Pesan lama dianggap sudah dibaca. Tanpa ini, seluruh riwayat percakapan
-- yang sudah lewat mendadak tampil sebagai belum dibaca begitu fiturnya
-- menyala, dan itu kabar palsu untuk pengirimnya.
UPDATE support_messages
SET is_read = true
WHERE is_read IS NULL OR is_read = false;

-- Penandaan baca menyaring per ruang dan per pengirim, jadi indeks ini yang
-- dipakai: cari pesan di satu ruang yang bukan dari saya dan belum dibaca.
CREATE INDEX IF NOT EXISTS idx_support_messages_room_unread
  ON support_messages (room_id, sender_id)
  WHERE is_read = false;
