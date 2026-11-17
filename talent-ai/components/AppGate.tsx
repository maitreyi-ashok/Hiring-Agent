'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { loadFromServer, readLegacy, refreshIfChanged, replaceDB, retireLegacy, update, useDB, useSync } from '@/lib/store';
import { useAI } from '@/lib/ai-client';
import { Notice } from './ui';

function Setup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card stack" style={{ maxWidth: 640, margin: '40px auto' }}>
      <h1 style={{ fontSize: '1.375rem' }}>{title}</h1>
      {children}
    </div>
  );
}

/** Decides what to show: setup help, sign-in, loading, or the app itself. Also polls for other people's changes. */
export default function AppGate({ children }: { children: ReactNode }) {
  const ai = useAI();
  const sync = useSync();
  const db = useDB();
  const [legacy, setLegacy] = useState<unknown | null>(null);

  const ready = Boolean(ai.status?.dbReady && ai.authed);

  // Not signed in → send to the sign-in / create-account page.
  useEffect(() => {
    const st = ai.status;
    if (st && !ai.authed && st.dbReady && st.secretReady) {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [ai.status, ai.authed]);

  useEffect(() => {
    if (ready && sync.phase === 'idle') void loadFromServer();
  }, [ready, sync.phase]);

  // A new company starts with its own name in Settings.
  const companyName = ai.status?.company?.name ?? '';
  useEffect(() => {
    if (sync.phase === 'ready' && companyName && !db.settings.companyName) {
      update((d) => ({ ...d, settings: { ...d.settings, companyName } }));
    }
  }, [sync.phase, companyName, db.settings.companyName]);

  useEffect(() => {
    if (sync.phase === 'error' && sync.code === 'auth') void ai.refresh();
  }, [sync.phase, sync.code, ai]);

  useEffect(() => {
    if (sync.phase !== 'ready') return;
    const empty = !db.jobs.length && !db.candidates.length && !db.roles.length && !db.employees.length;
    setLegacy(empty ? readLegacy() : null);
  }, [sync.phase, db.jobs.length, db.candidates.length, db.roles.length, db.employees.length]);

  useEffect(() => {
    if (sync.phase !== 'ready') return;
    const tick = () => document.visibilityState === 'visible' && void refreshIfChanged();
    const id = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [sync.phase]);

  if (!ai.status) return <p className="muted">Loading…</p>;

  if (!ai.status.dbReady) {
    return (
      <Setup title="Connect a database">
        <p className="muted">You are on a serverless host (such as Vercel), where a built-in database file would be erased between requests. Use Postgres there. The quickest way:</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>In your Vercel project open <strong>Storage</strong> → <strong>Create Database</strong> → <strong>Neon (Postgres)</strong> and connect it to this project.</li>
          <li>Vercel adds <code>DATABASE_URL</code> automatically. Redeploy.</li>
          <li>The app creates its tables on first use — nothing to run by hand.</li>
        </ol>
        <p className="small muted">Running on your own computer, a VPS or Docker? You do not need this: with no <code>DATABASE_URL</code> the app uses its built-in database automatically.</p>
      </Setup>
    );
  }

  if (!ai.status.secretReady) {
    return (
      <Setup title="One more setup step: a session secret">
        <p className="muted">Company logins are signed with a secret that only your server knows. In Vercel → Project → Settings → Environment Variables add:</p>
        <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li><code>SESSION_SECRET</code> — any long random string (for example 40+ random characters)</li>
        </ul>
        <p className="small muted">Then redeploy. Running locally? This is filled in for you in development.</p>
      </Setup>
    );
  }

  if (!ai.authed) return <p className="muted">Redirecting to sign in…</p>;

  if (sync.phase === 'idle' || sync.phase === 'loading') return <p className="muted">Loading your workspace…</p>;

  if (sync.phase === 'error') {
    return (
      <Setup title="Could not load your data">
        <Notice tone="bad">{sync.error}</Notice>
        <div><button type="button" className="btn btn--primary" onClick={() => void loadFromServer()}>Try again</button></div>
      </Setup>
    );
  }

  return (
    <>
      {sync.saveError && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="bad">{sync.saveError}</Notice>
        </div>
      )}
      {legacy !== null && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="info">
            <div className="row row--between">
              <span>This browser has data from the earlier browser-only version. Move it into the shared database?</span>
              <span className="row">
                <button type="button" className="btn btn--sm btn--primary" onClick={() => { replaceDB(legacy); retireLegacy(); setLegacy(null); }}>Move it</button>
                <button type="button" className="btn btn--sm" onClick={() => { retireLegacy(); setLegacy(null); }}>Not now</button>
              </span>
            </div>
          </Notice>
        </div>
      )}
      {children}
    </>
  );
}
