import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Load .env from the server folder first, then the repo root.
for (const candidate of [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../.env')]) {
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate });
}

const isProduction = process.env.NODE_ENV === 'production';

function readSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (isProduction) {
    throw new Error('SESSION_SECRET must be set (at least 16 characters) in production.');
  }
  // Development fallback: random per process (admins re-login after restart).
  return crypto.randomBytes(32).toString('hex');
}

function readAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (pw && pw.length >= 6) return pw;
  if (isProduction) throw new Error('ADMIN_PASSWORD must be set (at least 6 characters) in production.');
  return 'scalive-admin';
}

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  adminPassword: readAdminPassword(),
  sessionSecret: readSecret(),
  /** Public base URL encoded in QR codes, e.g. https://quiz.scalive.in (no trailing slash). */
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, '') || null,
  maxParticipants: Number(process.env.MAX_PARTICIPANTS) || 300,
  /** Length of the "Get ready" interstitial before each question. */
  getReadyMs: Number(process.env.GET_READY_MS ?? 3000),
  trustProxy: process.env.TRUST_PROXY ?? (isProduction ? '1' : 'loopback'),
  clientDist: path.resolve(__dirname, '../../../client/dist'),
};

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) out.push(addr.address);
    }
  }
  // Prefer typical home/office ranges first.
  return out.sort((a, b) => score(b) - score(a));
  function score(ip: string) {
    if (ip.startsWith('192.168.')) return 3;
    if (ip.startsWith('10.')) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 1;
    return 0;
  }
}
