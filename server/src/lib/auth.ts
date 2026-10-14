import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

export const ADMIN_COOKIE = 'scalive_admin';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — enough for a long workshop day

function sign(payload: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

export function createAdminToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ role: 'admin', exp: Date.now() + TTL_MS, n: crypto.randomBytes(8).toString('hex') }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function checkPassword(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

/** `secure` follows the actual protocol so plain-HTTP classroom LAN deployments still work. */
export const cookieOptions = (req: Request) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: req.secure,
  maxAge: TTL_MS,
  path: '/',
});

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (verifyAdminToken(req.cookies?.[ADMIN_COOKIE])) return next();
  res.status(401).json({ error: 'Admin login required.' });
}

/** Minimal cookie header parser for Socket.IO handshakes. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newParticipantToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}
