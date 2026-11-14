'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { startPreview } from '../../member/session';
import { SiteSelect } from '../../components/site-select';
import styles from './auth.module.css';

type Mode = 'login' | 'signup' | 'reset';

const titles = {
  login: 'Log in',
  signup: 'Create an account',
  reset: 'Reset your password',
};

export function AuthForm({ mode }: { mode: Mode }) {
  const signup = mode === 'signup';
  const reset = mode === 'reset';
  const router = useRouter();
  const [gender, setGender] = useState('');
  const [message, setMessage] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (reset) { setMessage('Password reset emails will be connected with the account backend.'); return; }
    const data = new FormData(event.currentTarget);
    if (signup && (!gender || data.get('password') !== data.get('confirm'))) {
      setMessage(!gender ? 'Select your gender.' : 'The passwords do not match.');
      return;
    }
    const email = String(data.get('email')).trim();
    const username = signup ? String(data.get('username')).trim() : email.split('@')[0];
    try {
      startPreview(email, username, gender);
      router.push('/myaccount');
    } catch { setMessage('Allow browser session storage to open a preview account.'); }
  }

  return (
    <main id="main" className={styles.page}>
      <section className={styles.card} aria-labelledby="auth-heading">
        <div className={styles.heading}>
          <h1 id="auth-heading">{titles[mode]}</h1>
        </div>
        <div className={styles.content}>
          {!reset && <p className={styles.preview}>Preview sign-in. Use sample details to explore your account.</p>}
          {!reset && (
            <>
              <button type="button" className={styles.google} disabled>
                <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
                  <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.5 9.5 0 0 1-4.1 6.1v5.1h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z" />
                  <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.6l-6.6-5.1c-1.8 1.2-4.2 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.5H5.8v5.3A20 20 0 0 0 24 44Z" />
                  <path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18l6.8-5.3Z" />
                  <path fill="#EA4335" d="M24 11.8c3 0 5.6 1 7.7 3l5.8-5.8A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.3A12 12 0 0 1 24 11.8Z" />
                </svg>
                Continue with Google
              </button>
              <p className={styles.divider}>or use your email</p>
            </>
          )}
          <form className={styles.form} method="post" onSubmit={submit}>
            {signup && (
              <>
                <label className={styles.field}>
                  Username
                  <input name="username" autoComplete="username" placeholder="Letters and numbers only" pattern="[A-Za-z0-9]+" required />
                </label>
                <SiteSelect label="Gender" name="gender" value={gender} onChange={setGender} required
                  options={['Woman', 'Man', 'Nonbinary', 'Another identity', 'Prefer not to say'].map((label) => ({ value: label, label }))}
                  placeholder="Select your gender" />
              </>
            )}
            <label className={styles.field}>
              Email
              <input name="email" type="email" autoComplete={mode === 'login' ? 'username' : 'email'} placeholder="you@example.com" required />
            </label>
            {!reset && (
              <>
                <div className={styles.field}>
                  <div className={styles.fieldHeading}>
                    <label htmlFor="account-password">Password</label>
                    {!signup && <Link href="/auth?mode=reset">Forgot password?</Link>}
                  </div>
                  <input id="account-password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'}
                    placeholder={signup ? 'At least 8 characters' : 'Enter your password'} minLength={signup ? 8 : undefined} required />
                </div>
                <p className={styles.notice}>
                  {signup ? 'Choose a password you only use for BackpageNew.' : 'BackpageNew will never ask you to share your password by email or chat.'}
                </p>
              </>
            )}
            {signup && (
              <>
                <label className={styles.field}>
                  Confirm password
                  <input name="confirm" type="password" autoComplete="new-password" placeholder="Enter your password again" required />
                </label>
                <div className={styles.consent}>
                  <input id="account-terms" type="checkbox" required />
                  <div>
                    <label htmlFor="account-terms">I agree to the </label>
                    <Link href="/terms">Terms of Service</Link> and have read the <Link href="/privacy">Privacy Policy</Link>.
                  </div>
                </div>
              </>
            )}
            <button className={styles.submit} type="submit">
              {reset ? 'Send reset link' : titles[mode]}
            </button>
            {message && <p role="alert">{message}</p>}
            {mode === 'login' && (
              <p className={styles.legal}>
                This site is protected by hCaptcha and its{' '}
                <a href="https://www.hcaptcha.com/privacy">Privacy Policy</a> and{' '}
                <a href="https://www.hcaptcha.com/terms">Terms of Service</a> apply.
              </p>
            )}
          </form>
        </div>
      </section>
      <p className={styles.switch}>
        {mode === 'login' ? (
          <>Don&apos;t have an account yet? <Link href="/auth?mode=signup">Create an account</Link></>
        ) : mode === 'signup' ? (
          <>Already have an account? <Link href="/auth"><strong>Log in here</strong></Link></>
        ) : <Link href="/auth">Back to log in</Link>}
      </p>
    </main>
  );
}
