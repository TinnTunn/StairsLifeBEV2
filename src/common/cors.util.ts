// Penyusun daftar origin yang diizinkan, dipakai REST dan kedua gateway WebSocket.

export function buildCorsOriginList(): string[] {
  const fromEnv = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isDev = (process.env.NODE_ENV || 'development') !== 'production';
  const devDefaults = isDev
    ? [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
      ]
    : [];

  return Array.from(new Set([...fromEnv, ...devDefaults]));
}
