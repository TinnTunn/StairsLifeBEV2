import { tentukanKode } from './kode-galat';

describe('tentukanKode', () => {
  it('memetakan pesan dengan angka rupiah ke kode dan params', () => {
    expect(tentukanKode(400, 'Minimal penarikan Rp 50.000')).toEqual({
      code: 'WITHDRAWAL_BELOW_MIN',
      params: { amount: 50000 },
    });
    expect(tentukanKode(400, 'Saldo tidak cukup. Tersedia: Rp 1.250.000')).toEqual({
      code: 'WALLET_INSUFFICIENT',
      params: { amount: 1250000 },
    });
  });

  it('mengenali login akun beku dari pesan JSON', () => {
    const pesan = JSON.stringify({ suspended: true, reason: 'spam' });
    expect(tentukanKode(401, pesan).code).toBe('ACCOUNT_SUSPENDED');
  });

  it('memakai pesan pertama yang dikenali dari class-validator', () => {
    expect(tentukanKode(400, ['email must be an email', 'Reason minimal 20 karakter']).code).toBe(
      'DISPUTE_REASON_TOO_SHORT',
    );
    expect(tentukanKode(400, ['sesuatu yang lain']).code).toBe('VALIDATION_FAILED');
  });

  it('jatuh ke kode per status untuk pesan yang tidak dikenal', () => {
    expect(tentukanKode(404, 'Apa pun')).toEqual({ code: 'NOT_FOUND' });
    expect(tentukanKode(503, 'Apa pun')).toEqual({ code: 'INTERNAL' });
  });
});
