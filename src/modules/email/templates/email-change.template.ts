import { htmlLayout, ctaButton, escapeHtml } from './layout';

/** Dikirim ke alamat BARU: membuktikan pemilik akun menguasai alamat itu. */
export function emailChangeTemplate(props: {
  fullName: string;
  newEmail: string;
  confirmUrl: string;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(props.fullName || 'Kamu');
  const email = escapeHtml(props.newEmail);

  const bodyHtml = `
    <h2 style="margin:0 0 16px 0;font-size:22px;font-weight:800;color:#0f172a">
      Konfirmasi email baru
    </h2>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151">
      Hai ${name}, kamu meminta mengganti email akun StairsLife ke
      <strong>${email}</strong>. Klik tombol di bawah untuk mengonfirmasi.
      Sampai dikonfirmasi, kamu tetap masuk dengan email lama.
    </p>
    ${ctaButton({ url: props.confirmUrl, label: 'Konfirmasi email baru' })}
    <p style="margin:24px 0 8px 0;font-size:13px;color:#6b7280">Atau salin link ini ke browser:</p>
    <p style="margin:0 0 24px 0;font-size:13px;word-break:break-all">
      <a href="${props.confirmUrl}" style="color:#14b8a6;text-decoration:underline">${props.confirmUrl}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">
      Link berlaku 1 jam. Bukan kamu yang meminta? Abaikan email ini; email akun tidak berubah.
    </p>
  `;

  const text = `Hai ${props.fullName || 'Kamu'},

Kamu meminta mengganti email akun StairsLife ke ${props.newEmail}.
Buka link berikut untuk mengonfirmasi (berlaku 1 jam):

${props.confirmUrl}

Bukan kamu yang meminta? Abaikan email ini; email akun tidak berubah.

Tim StairsLife
`;

  return {
    subject: 'Konfirmasi email baru StairsLife',
    html: htmlLayout({ title: 'Konfirmasi email baru', bodyHtml }),
    text,
  };
}

/** Dikirim ke alamat LAMA setelah penggantian berhasil. */
export function emailChangedNoticeTemplate(props: {
  fullName: string;
  newEmail: string;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(props.fullName || 'Kamu');
  const email = escapeHtml(props.newEmail);

  const bodyHtml = `
    <h2 style="margin:0 0 16px 0;font-size:22px;font-weight:800;color:#0f172a">
      Email akun sudah diganti
    </h2>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151">
      Hai ${name}, email akun StairsLife kamu sekarang <strong>${email}</strong>.
      Mulai sekarang, masuk memakai alamat itu.
    </p>
    <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6">
      Bukan kamu yang mengganti? Segera hubungi tim StairsLife dengan membalas
      lewat halaman bantuan, dan sertakan email lama ini.
    </p>
  `;

  const text = `Hai ${props.fullName || 'Kamu'},

Email akun StairsLife kamu sekarang ${props.newEmail}. Mulai sekarang, masuk memakai alamat itu.

Bukan kamu yang mengganti? Segera hubungi tim StairsLife lewat halaman bantuan.

Tim StairsLife
`;

  return {
    subject: 'Email akun StairsLife sudah diganti',
    html: htmlLayout({ title: 'Email akun diganti', bodyHtml }),
    text,
  };
}
