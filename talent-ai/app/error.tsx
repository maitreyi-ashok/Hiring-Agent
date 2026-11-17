'use client';

/** Shows a readable message instead of a blank page when something crashes while rendering. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card stack" style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Something went wrong</h1>
        <p className="muted">The page failed to load. Details below can help track it down.</p>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{error.message}{error.digest ? `\n(digest ${error.digest})` : ''}</pre>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={reset}>Try again</button>
          <a className="btn" href="/login">Go to sign in</a>
        </div>
      </div>
    </main>
  );
}
