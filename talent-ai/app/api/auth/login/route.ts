import { json, rateLimited } from '@/lib/ai-server';
import { normEmail, verifyPassword } from '@/lib/accounts';
import { dbEnabled, findCompanyByEmail } from '@/lib/db';
import { sameOrigin } from '@/lib/server-guard';
import { makeToken, secretReady, sessionCookie } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!dbEnabled()) return json({ error: 'No database is available. On Vercel or other serverless hosts, add Neon Postgres (DATABASE_URL).', code: 'no_db' }, 503);
  if (!secretReady()) return json({ error: 'Set the SESSION_SECRET environment variable on this deployment.', code: 'no_secret' }, 503);
  if (!sameOrigin(req)) return json({ error: 'Cross-site request blocked.' }, 403);
  if (rateLimited(req, 10, 10 * 60 * 1000, 'login')) return json({ error: 'Too many attempts. Try again in 10 minutes.' }, 429);

  let email = '';
  let password = '';
  try {
    const b = (await req.json()) as { email?: unknown; password?: unknown };
    email = normEmail(b.email);
    password = typeof b.password === 'string' ? b.password : '';
  } catch {
    /* fall through */
  }
  try {
    const company = email && password ? await findCompanyByEmail(email) : null;
    // Same message whether the email or the password was wrong.
    if (!company || !(await verifyPassword(password, company.passHash))) return json({ error: 'Email or password is not correct.' }, 401);
    const res = json({ ok: true });
    res.headers.append('set-cookie', sessionCookie(makeToken(company.id)));
    return res;
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not sign in.' }, 502);
  }
}
