'use client';

import { useState } from 'react';

function nextPath() {
  if (typeof window === 'undefined') return '/studio';
  const next = new URLSearchParams(window.location.search).get('next') || '/studio';
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/studio';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/studio-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.assign(nextPath());
        return;
      }
      setError(data.error || 'Sign-in failed. Try again.');
    } catch {
      setError('The connection dropped. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
        <div>
          <h1 className="text-xl font-semibold">Xaen Studio</h1>
          <p className="mt-1 text-sm text-neutral-400">Sign in with your Xaen Tower account.</p>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-300">Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-300">Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-300">Authenticator code</span>
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 tracking-widest outline-none focus:border-neutral-400" />
        </label>
        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-white px-3 py-2 font-medium text-neutral-950 disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
