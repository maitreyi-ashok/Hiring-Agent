import { createHmac, timingSafeEqual } from 'crypto';

/* Company login. The session cookie is signed (HMAC) and carries the company id, so every request knows which company it belongs to. */

export const COOKIE = 'ta_session';
const TTL_SECONDS = 7 * 24 * 3600;

/** SESSION_SECRET is required in production. In local development a fixed fallback is used so you can try it straight away. */
const secret = () => process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'talent-ai-dev-only-secret');
export const secretReady = () => Boolean(secret());
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function makeToken(orgId: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + TTL_SECONDS;
  const body = `${orgId}.${exp}`;
  return `${body}.${sign(body)}`;
}

/** Returns the company id if the token is genuine and unexpired, otherwise null. */
export function verifyToken(token: string | undefined, nowMs = Date.now()): string | null {
  if (!token || !secret()) return null;
  const [org, exp, sig] = token.split('.');
  if (!org || !exp || !sig || !/^[a-f0-9]{16,64}$/.test(org) || !/^\d+$/.test(exp) || Number(exp) * 1000 < nowMs) return null;
  const expected = Buffer.from(sign(`${org}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? org : null;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/** The signed-in company's id, or null. */
export const sessionOrg = (req: Request): string | null => verifyToken(readCookie(req, COOKIE));
export const hasSession = (req: Request) => sessionOrg(req) !== null;

const secure = () => (process.env.NODE_ENV === 'production' ? '; Secure' : '');
export const sessionCookie = (token: string) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}${secure()}`;
export const clearedCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`;
