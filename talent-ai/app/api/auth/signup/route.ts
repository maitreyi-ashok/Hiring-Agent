import { json, rateLimited } from '@/lib/ai-server';
import { EMAIL_RE, hashPassword, normEmail } from '@/lib/accounts';
import { createCompany, dbEnabled } from '@/lib/db';
import { newId, sameOrigin } from '@/lib/server-guard';
import { makeToken, secretReady, sessionCookie } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Create a company account and sign it in. Each company gets its own private workspace. */
export async function POST(req: Request) {
  if (!dbEnabled()) return json({ error: 'No database is available. On Vercel or other serverless hosts, add Neon Postgres (DATABASE_URL).', code: 'no_db' }, 503);
  if (!secretReady()) return json({ error: 'Set the SESSION_SECRET environment variable on this deployment.', code: 'no_secret' }, 503);
  if (!sameOrigin(req)) return json({ error: 'Cross-site request blocked.' }, 403);
  if (rateLimited(req, 8, 60 * 60 * 1000, 'signup')) return json({ error: 'Too many sign-ups from this network. Try again later.' }, 429);

  let b: Record<string, unknown> = {};
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const name = typeof b.company === 'string' ? b.company.trim().slice(0, 80) : '';
  const email = normEmail(b.email);
  const password = typeof b.password === 'string' ? b.password : '';
  if (name.length < 2) return json({ error: 'Enter your company name.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid work email.' }, 400);
  if (password.length < 8 || password.length > 200) return json({ error: 'Use a password of at least 8 characters.' }, 400);

  try {
    const id = newId().slice(0, 32);
    const ok = await createCompany({ id, name, email, passHash: await hashPassword(password) });
    if (!ok) return json({ error: 'An account with that email already exists. Sign in instead.' }, 409);
    const res = json({ ok: true });
    res.headers.append('set-cookie', sessionCookie(makeToken(id)));
    return res;
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not create the account.' }, 502);
  }
}
