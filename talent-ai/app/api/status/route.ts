import { aiEnabled, json, MODEL } from '@/lib/ai-server';
import { dbEnabled, dbKind, getCompany } from '@/lib/db';
import { secretReady, sessionOrg } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What this deployment can do, and who (if anyone) is signed in. Never returns secrets. */
export async function GET(req: Request) {
  const org = secretReady() ? sessionOrg(req) : null;
  let company: { name: string; email: string } | null = null;
  if (org && dbEnabled()) {
    const c = await getCompany(org).catch(() => null);
    company = c ? { name: c.name, email: c.email } : null;
  }
  return json({
    authenticated: Boolean(org && (company || !dbEnabled())),
    company,
    secretReady: secretReady(),
    dbReady: dbEnabled(),
    dbKind: dbKind(),
    aiAvailable: aiEnabled(),
    mailReady: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
    videoProvider: process.env.DAILY_API_KEY ? 'daily' : 'jitsi',
    model: MODEL,
  });
}
