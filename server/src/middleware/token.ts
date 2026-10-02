import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { config } from '../config/index.js';
import type { JwtUserPayload, RefreshTokenPayload } from '../types/domain.js';
import { unauthorized } from '../utils/errors.js';

export function signAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
    issuer: 'condomini-api',
    audience: 'condomini-client',
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
    issuer: 'condomini-api',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtUserPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      issuer: 'condomini-api',
      audience: 'condomini-client',
    });
    return decoded as JwtUserPayload;
  } catch {
    throw unauthorized('Token di accesso non valido o scaduto');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret, { issuer: 'condomini-api' });
    if (typeof decoded === 'string' || decoded.type !== 'refresh') {
      throw unauthorized('Refresh token non valido');
    }
    return decoded as RefreshTokenPayload;
  } catch (err) {
    if (err instanceof Error && err.name === 'AppError') throw err;
    throw unauthorized('Refresh token non valido o scaduto');
  }
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/api/auth',
  });
}
