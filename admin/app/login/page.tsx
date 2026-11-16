'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Turnstile } from '../../../src/components/turnstile';

export default function AdminLogin() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      if (!captchaToken) throw new Error('Complete the security check first.');
      const response = await fetch('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: form.get('email'), password: form.get('password'), captchaToken }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in');
      router.replace('/admin'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in'); setCaptchaToken(''); }
    finally { setBusy(false); }
  }
  return <main className="admin-login"><section><img src="/brand/backpage-new-logo.png" alt="BackpageNew" /><h1>Administrator sign in</h1><button className="google" type="button" disabled={busy} onClick={() => { setBusy(true); window.location.assign('/api/admin/auth/google/start'); }}><svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.5 9.5 0 0 1-4.1 6.1v5.1h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z" /><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.6l-6.6-5.1c-1.8 1.2-4.2 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.5H5.8v5.3A20 20 0 0 0 24 44Z" /><path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18l6.8-5.3Z" /><path fill="#EA4335" d="M24 11.8c3 0 5.6 1 7.7 3l5.8-5.8A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.3A12 12 0 0 1 24 11.8Z" /></svg>Continue with Google</button><p className="divider">or continue with email</p><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><Turnstile onToken={setCaptchaToken} onError={() => setMessage('Security check could not load. Please refresh and try again.')} />{message && <p role="alert">{message}</p>}<button disabled={busy || !captchaToken}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="legal">This site is protected by Cloudflare Turnstile.</p></section></main>;
}
