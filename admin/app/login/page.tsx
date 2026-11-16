'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
export default function AdminLogin() {
  const router = useRouter(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(''); const form = new FormData(event.currentTarget); try { const response = await fetch('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to sign in'); router.replace('/admin'); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in'); } finally { setBusy(false); } }
  return <main className="admin-login"><section><img src="/brand/backpage-new-logo.png" alt="BackpageNew" /><h1>Administrator sign in</h1><p>Use your administrator account to manage BackpageNew.</p><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{message && <p role="alert">{message}</p>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}
