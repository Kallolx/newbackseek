'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState, useSyncExternalStore } from 'react';
import { FeedbackToast } from '../../../src/components/toast';
import { Turnstile } from '../../../src/components/turnstile';
import { PasswordField } from '../../../src/components/password-field';

export default function AdminLogin() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [captchaToken, setCaptchaToken] = useState('');
  // The same login page serves the admin panel and the manager portal (manager.* host).
  const manager = useSyncExternalStore(() => () => {}, () => window.location.hostname.startsWith('manager.'), () => false);
  useEffect(() => { document.title = manager ? 'Manager sign in – BackpageNew' : 'Administrator sign in – BackpageNew'; }, [manager]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      if (!captchaToken) throw new Error('Complete the security check first.');
      const response = await fetch('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: form.get('email'), password: form.get('password'), captchaToken }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in');
      router.replace('/admin'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in'); setCaptchaToken(''); setCaptchaAttempt(value => value + 1); }
    finally { setBusy(false); }
  }
  return <main className="admin-login"><section><img src="/brand/backpage-new-logo.png" alt="BackpageNew" /><h1>{manager ? 'Manager sign in' : 'Administrator sign in'}</h1><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<PasswordField name="password" autoComplete="current-password" required /></label><Turnstile key={captchaAttempt} onToken={setCaptchaToken} onError={() => setMessage('Security check could not load. Please refresh and try again.')} /><FeedbackToast message={message} /><button disabled={busy || !captchaToken}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="legal">This site is protected by Cloudflare Turnstile.</p></section></main>;
}
