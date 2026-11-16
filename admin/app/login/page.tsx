'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Turnstile } from '../../../src/components/turnstile';

export default function AdminLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState(params.get('error') ? 'Google sign-in was not authorized for this administrator account.' : '');
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
  return <main className="admin-login"><section><img src="/brand/backpage-new-logo.png" alt="BackpageNew" /><h1>Administrator sign in</h1><p>Use your administrator account to manage BackpageNew.</p><button className="google" type="button" disabled={busy} onClick={() => { setBusy(true); window.location.assign('/api/admin/auth/google/start'); }}>Continue with Google</button><p className="divider">or continue with email</p><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><Turnstile onToken={setCaptchaToken} onError={() => setMessage('Security check could not load. Please refresh and try again.')} />{message && <p role="alert">{message}</p>}<button disabled={busy || !captchaToken}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="legal">This site is protected by Cloudflare Turnstile.</p></section></main>;
}
