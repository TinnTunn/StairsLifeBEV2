// Bentuk isi token JWT.

export interface JwtUser {
  id: string;
  email: string;
  role: string;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
