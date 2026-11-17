'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { SiteSelect } from '../../components/site-select';
import { FeedbackToast, toast } from '../../components/toast';
import { Turnstile } from '../../components/turnstile';
import styles from './auth.module.css';

type Mode = 'login' | 'signup' | 'reset';
const titles = { login: 'Log in', signup: 'Create an account', reset: 'Reset your password' };

export function AuthForm({ mode }: { mode: Mode }) {
  const signup = mode === 'signup';
  const reset = mode === 'reset';
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = searchParams.get('next') === '/myaccount/post' ? '/myaccount/post' : '/myaccount';
  const [gender, setGender] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [message, setMessage] = useState(searchParams.get('error') ? 'Google sign-in could not be completed. Please try again or use email.' : '');
  useEffect(()=>{if(searchParams.get('email')==='verified')toast.success('Email verified. You can now log in.');if(searchParams.get('email')==='invalid')toast.error('This verification link has expired or was already used.');},[searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (reset) { setMessage('Password reset emails will be available shortly.'); return; }
    const data = new FormData(event.currentTarget);
    if (signup && (!gender || data.get('password') !== data.get('confirm'))) {
      setMessage(!gender ? 'Select your gender.' : 'The passwords do not match.');
      return;
    }
    if (!captchaToken) { setMessage('Complete the security check first.'); return; }
    const body = signup
      ? { email: String(data.get('email')).trim(), username: String(data.get('username')).trim(), password: String(data.get('password')), captchaToken }
      : { email: String(data.get('email')).trim(), password: String(data.get('password')), captchaToken };
    try {
      setBusy(true);
      const response = await fetch(signup ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to continue right now.');
      if (signup) toast[result.verificationEmailSent === false ? 'warning' : 'success'](result.verificationEmailSent === false ? 'Account created, but the email could not be sent. Log in and resend it from Account Settings.' : 'Account created. Check your inbox to verify your email, then log in.');
      window.dispatchEvent(new Event('bpn-session-change'));
      router.replace(signup ? '/auth' : destination);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to continue right now.');
      setCaptchaToken(''); setCaptchaAttempt(value => value + 1);
    } finally { setBusy(false); }
  }

  return <main id="main" className={styles.page}>
    <section className={styles.card} aria-labelledby="auth-heading">
      <div className={styles.heading}><h1 id="auth-heading">{titles[mode]}</h1></div>
      <div className={styles.content}>
        {!reset && <>
          <button type="button" className={styles.google} disabled={busy} onClick={() => { setBusy(true); window.location.assign('/api/auth/google/start'); }}>
            <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.5 9.5 0 0 1-4.1 6.1v5.1h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z" /><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.6l-6.6-5.1c-1.8 1.2-4.2 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.5H5.8v5.3A20 20 0 0 0 24 44Z" /><path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18l6.8-5.3Z" /><path fill="#EA4335" d="M24 11.8c3 0 5.6 1 7.7 3l5.8-5.8A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.3A12 12 0 0 1 24 11.8Z" /></svg>
            Continue with Google
          </button>
          <p className={styles.divider}>or continue with email</p>
        </>}
        <form className={styles.form} method="post" onSubmit={submit}>
          {signup && <><label className={styles.field}>Username<input name="username" autoComplete="username" placeholder="Letters and numbers only" pattern="[A-Za-z0-9]+" required /></label><SiteSelect label="Gender" name="gender" value={gender} onChange={setGender} required options={['Woman', 'Man', 'Nonbinary', 'Another identity', 'Prefer not to say'].map((label) => ({ value: label, label }))} placeholder="Select your gender" /></>}
          <label className={styles.field}>Email<input name="email" type="email" autoComplete={mode === 'login' ? 'username' : 'email'} placeholder="you@example.com" required /></label>
          {!reset && <><div className={styles.field}><div className={styles.fieldHeading}><label htmlFor="account-password">Password</label>{!signup && <Link href="/auth?mode=reset">Forgot password?</Link>}</div><input id="account-password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 12 characters' : 'Enter your password'} minLength={signup ? 12 : undefined} required /></div><p className={styles.notice}>{signup ? 'Choose a password you only use for BackpageNew.' : 'BackpageNew will never ask you to share your password by email or chat.'}</p></>}
          {signup && <><label className={styles.field}>Confirm password<input name="confirm" type="password" autoComplete="new-password" placeholder="Enter your password again" required /></label><div className={styles.consent}><input id="account-terms" type="checkbox" required /><div><label htmlFor="account-terms">I agree to the </label><Link href="/terms">Terms of Service</Link> and have read the <Link href="/privacy">Privacy Policy</Link>.</div></div></>}
          {!reset && <Turnstile key={captchaAttempt} onToken={setCaptchaToken} onError={() => setMessage('Security check could not load. Please refresh and try again.')} />}
          <button className={styles.submit} type="submit" disabled={busy || (!reset && !captchaToken)}>{busy ? 'Please wait…' : reset ? 'Send reset link' : titles[mode]}</button>
          <FeedbackToast message={message} />
          {mode === 'login' && <p className={styles.legal}>This site is protected by Cloudflare Turnstile and the <a href="https://www.cloudflare.com/privacypolicy/">Privacy Policy</a> and <a href="https://www.cloudflare.com/website-terms/">Terms of Service</a> apply.</p>}
        </form>
      </div>
    </section>
    <p className={styles.switch}>{mode === 'login' ? <>Don&apos;t have an account yet? <Link href={destination === '/myaccount/post' ? '/auth?mode=signup&next=/myaccount/post' : '/auth?mode=signup'}>Create an account</Link></> : mode === 'signup' ? <>Already have an account? <Link href={destination === '/myaccount/post' ? '/auth?next=/myaccount/post' : '/auth'}><strong>Log in here</strong></Link></> : <Link href="/auth">Back to log in</Link>}</p>
  </main>;
}
