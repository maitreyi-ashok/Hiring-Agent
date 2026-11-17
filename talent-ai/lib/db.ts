import { neon } from '@neondatabase/serverless';

/**
 * Postgres (Neon) access. Multi-company: every company (org) has its own rows in one document table —
 * jobs, candidates, roles, employees, settings, agent events, and the tests / interviews that candidates open.
 * Companies themselves live in ta_companies. Every query for recruiter data is filtered by org.
 *
 * Two storage engines, same SQL:
 *   • Postgres (Neon) when DATABASE_URL is set — required on Vercel and other serverless hosts.
 *   • A built-in SQLite file (data/talent-ai.db, or DATA_DIR) when it is not — no setup, for your own computer,
 *     a VPS or Docker. Serverless disks are wiped between requests, so it is not offered there.
 */

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || '';
const serverless = () => Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
export type DbKind = 'postgres' | 'embedded' | 'none';
export const dbKind = (): DbKind => (url() ? 'postgres' : serverless() ? 'none' : 'embedded');
export const dbEnabled = () => dbKind() !== 'none';

type Row = Record<string, unknown>;
type Runner = (text: string, params?: unknown[]) => Promise<Row[]>;

let runner: Runner | null = null;
let opening: Promise<Runner> | null = null;
let ready: Promise<void> | null = null;

/** Test hook: swap in another SQL runner. */
export function __setRunner(r: Runner | null) {
  runner = r;
  opening = null;
  ready = null;
}

function postgresRunner(): Runner {
  const sql = neon(url());
  return (t, p) => sql.query(t, p ?? []) as Promise<Row[]>;
}

/** SQLite file. The Postgres-style `$1` placeholders are rewritten to `?` so every query below works on both engines. */
async function sqliteRunner(): Promise<Runner> {
  const [{ default: Database }, fs, path] = await Promise.all([import('better-sqlite3'), import('fs'), import('path')]);
  const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = new Database(path.join(dir, 'talent-ai.db'));
  file.pragma('journal_mode = WAL');
  file.pragma('busy_timeout = 5000');
  return async (text, params = []) => {
    const ordered: unknown[] = [];
    const sql = text.replace(/\$(\d+)/g, (_m, n: string) => {
      ordered.push(params[Number(n) - 1]);
      return '?';
    });
    const stmt = file.prepare(sql);
    if (stmt.reader) return stmt.all(...ordered) as Row[];
    stmt.run(...ordered);
    return [];
  };
}

async function run(text: string, params: unknown[] = []): Promise<Row[]> {
  if (!runner) {
    opening ??= url() ? Promise.resolve(postgresRunner()) : sqliteRunner();
    try {
      runner = await opening;
    } catch (e) {
      opening = null;
      throw e;
    }
  }
  return runner(text, params);
}

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await run(
        `CREATE TABLE IF NOT EXISTS ta_companies (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           email TEXT NOT NULL,
           pass_hash TEXT NOT NULL,
           created_at BIGINT NOT NULL
         )`,
      );
      await run('CREATE UNIQUE INDEX IF NOT EXISTS ta_companies_email ON ta_companies (email)');
      await run(
        `CREATE TABLE IF NOT EXISTS ta_docs (
           org TEXT NOT NULL,
           kind TEXT NOT NULL,
           id TEXT NOT NULL,
           data JSONB NOT NULL,
           updated_at BIGINT NOT NULL,
           PRIMARY KEY (org, kind, id)
         )`,
      );
      await run('CREATE INDEX IF NOT EXISTS ta_docs_id ON ta_docs (kind, id)');
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/* ---------- companies ---------- */

export type Company = { id: string; name: string; email: string; passHash: string };
const toCompany = (r: Row): Company => ({ id: String(r.id), name: String(r.name), email: String(r.email), passHash: String(r.pass_hash) });

/** Returns false if that email already has an account. */
export async function createCompany(c: Company): Promise<boolean> {
  await ensureSchema();
  const rows = await run(
    'INSERT INTO ta_companies (id, name, email, pass_hash, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING RETURNING id',
    [c.id, c.name, c.email, c.passHash, Date.now()],
  );
  return rows.length > 0;
}

export async function findCompanyByEmail(email: string): Promise<Company | null> {
  await ensureSchema();
  const rows = await run('SELECT id, name, email, pass_hash FROM ta_companies WHERE email = $1', [email]);
  return rows[0] ? toCompany(rows[0]) : null;
}

export async function getCompany(id: string): Promise<Company | null> {
  await ensureSchema();
  const rows = await run('SELECT id, name, email, pass_hash FROM ta_companies WHERE id = $1', [id]);
  return rows[0] ? toCompany(rows[0]) : null;
}

const parse = (v: unknown): unknown => {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
};

let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

export const KINDS = ['job', 'candidate', 'role', 'employee', 'settings', 'event'] as const;
export type Kind = (typeof KINDS)[number];

export async function getDoc<T>(org: string, kind: string, id: string): Promise<T | null> {
  await ensureSchema();
  const rows = await run('SELECT data FROM ta_docs WHERE org = $1 AND kind = $2 AND id = $3', [org, kind, id]);
  return rows[0] ? (parse(rows[0].data) as T) : null;
}

/** Candidate-facing lookup: the link id is unguessable, so it alone identifies the record (and which company it belongs to). */
export async function getAnyDoc<T>(kind: string, id: string): Promise<{ org: string; data: T } | null> {
  await ensureSchema();
  const rows = await run('SELECT org, data FROM ta_docs WHERE kind = $1 AND id = $2 LIMIT 1', [kind, id]);
  return rows[0] ? { org: String(rows[0].org), data: parse(rows[0].data) as T } : null;
}

export async function putDoc(org: string, kind: string, id: string, value: unknown): Promise<void> {
  await ensureSchema();
  await run(
    'INSERT INTO ta_docs (org, kind, id, data, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (org, kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at',
    [org, kind, id, JSON.stringify(value), stamp()],
  );
}

export async function delDoc(org: string, kind: string, id: string): Promise<void> {
  await ensureSchema();
  await run('DELETE FROM ta_docs WHERE org = $1 AND kind = $2 AND id = $3', [org, kind, id]);
}

const marks = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `$${from + i}`).join(',');

export async function listKinds(org: string, kinds: readonly string[]): Promise<{ kind: string; id: string; data: unknown }[]> {
  await ensureSchema();
  const rows = await run(`SELECT kind, id, data FROM ta_docs WHERE org = $1 AND kind IN (${marks(kinds.length, 2)})`, [org, ...kinds]);
  return rows.map((r) => ({ kind: String(r.kind), id: String(r.id), data: parse(r.data) }));
}

/** Cheap change detector: count + newest update time of this company's data. */
export async function revision(org: string, kinds: readonly string[] = KINDS): Promise<string> {
  await ensureSchema();
  const rows = await run(`SELECT COUNT(*) AS n, MAX(updated_at) AS m FROM ta_docs WHERE org = $1 AND kind IN (${marks(kinds.length, 2)})`, [org, ...kinds]);
  return `${String(rows[0]?.n ?? 0)}:${String(rows[0]?.m ?? 0)}`;
}

export type Changes = { upserts: { kind: string; id: string; data: unknown }[]; deletes: { kind: string; id: string }[] };

export async function applyChanges(org: string, c: Changes): Promise<void> {
  await ensureSchema();
  const at = stamp();
  for (let i = 0; i < c.upserts.length; i += 40) {
    const chunk = c.upserts.slice(i, i + 40);
    const values = chunk.map((_, j) => `($1, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4}, $${j * 4 + 5})`).join(', ');
    const params = [org, ...chunk.flatMap((u) => [u.kind, u.id, JSON.stringify(u.data), at])];
    await run(
      `INSERT INTO ta_docs (org, kind, id, data, updated_at) VALUES ${values} ON CONFLICT (org, kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      params,
    );
  }
  const byKind = new Map<string, string[]>();
  for (const d of c.deletes) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d.id]);
  for (const [kind, ids] of byKind) {
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      await run(`DELETE FROM ta_docs WHERE org = $1 AND kind = $2 AND id IN (${marks(part.length, 3)})`, [org, kind, ...part]);
    }
  }
  if (c.upserts.some((u) => u.kind === 'event')) {
    await run(
      "DELETE FROM ta_docs WHERE org = $1 AND kind = 'event' AND id NOT IN (SELECT id FROM ta_docs WHERE org = $1 AND kind = 'event' ORDER BY updated_at DESC LIMIT 500)",
      [org],
    );
  }
}

/** Housekeeping for candidate-facing records (tests and interviews) older than the given age, across all companies. */
export async function purgeOld(kinds: string[], olderThanMs: number): Promise<void> {
  await ensureSchema();
  await run(`DELETE FROM ta_docs WHERE kind IN (${marks(kinds.length, 2)}) AND updated_at < $1`, [Date.now() - olderThanMs, ...kinds]);
}
