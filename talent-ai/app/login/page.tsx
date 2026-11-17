'use client';

import { useEffect, useState } from 'react';
import { useAI } from '@/lib/ai-client';
import { Notice } from '@/components/ui';

/** Only allow same-site relative paths as a post-login destination. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/';
}

export default function LoginPage() {
  const ai = useAI();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dest, setDest] = useState('/');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setDest(safeNext(q.get('next')));
    if (q.get('mode') === 'signup') setMode('signup');
  }, []);

  // Already signed in → go straight to the app.
  useEffect(() => {
    if (ai.authed) window.location.replace(dest);
  }, [ai.authed, dest]);

  const s = ai.status;
  const signup = mode === 'signup';
  const ready = Boolean(s && s.dbReady && s.secretReady);
  const canSubmit = ready && email && pass && (!signup || company.trim().length >= 2) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    const problem = signup ? await ai.signup(company.trim(), email, pass) : await ai.login(email, pass);
    if (problem) {
      setErr(problem);
      setBusy(false);
    } else {
      window.location.assign(dest);
    }
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card stack" style={{ width: '100%', maxWidth: 420, padding: 28 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="brand__mark" aria-hidden="true">T</span>
          <div>
            <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Talent AI</h1>
            <div className="small muted">AI hiring agent for your company</div>
          </div>
        </div>

        <div className="row" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={!signup} className={`btn btn--sm ${!signup ? 'btn--primary' : ''}`} onClick={() => { setMode('signin'); setErr(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={signup} className={`btn btn--sm ${signup ? 'btn--primary' : ''}`} onClick={() => { setMode('signup'); setErr(''); }}>Create company account</button>
        </div>

        {!s && <p className="muted" role="status">Checking the server…</p>}
        {s && !s.dbReady && (
          <Notice tone="warn">This serverless host needs a Postgres database. Add Neon Postgres to this project (<code>DATABASE_URL</code>), then redeploy.</Notice>
        )}
        {s && s.dbReady && !s.secretReady && (
          <Notice tone="warn">Set the <code>SESSION_SECRET</code> environment variable (any long random string), then redeploy.</Notice>
        )}

        {s && (
          <form className="stack" onSubmit={submit}>
            {signup && (
              <label className="field">
                <span className="field__label">Company name</span>
                <input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" placeholder="Acme Inc." maxLength={80} autoFocus />
              </label>
            )}
            <label className="field">
              <span className="field__label">Work email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" autoFocus={!signup} />
            </label>
            <label className="field">
              <span className="field__label">Password{signup ? ' (8+ characters)' : ''}</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
              </div>
            </label>
            {err && <Notice tone="bad">{err}</Notice>}
            <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
            </button>
            {signup && <p className="small muted" style={{ margin: 0 }}>Each company gets its own private workspace. Other companies can never see your jobs, candidates or employees.</p>}
          </form>
        )}
      </div>
    </main>
  );
}
