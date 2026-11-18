'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FiAlertTriangle, FiCheck, FiCopy, FiKey, FiLogOut, FiMail, FiMonitor, FiShield, FiSmartphone, FiTrash2, FiUser } from 'react-icons/fi';
import { PasswordField } from '../components/password-field';
import { toast } from '../components/toast';
import { PageLoader } from '../components/page-state';
import type { MemberSession } from './session';
import styles from './member.module.css';

type Device = { id: string; current: boolean; createdAt: string; userAgent: string; ip: string; country: string };
type Security = { account: { createdAt: string; passwordSet: boolean; passwordChangedAt: string | null; google: boolean; twoFactor: boolean; twoFactorSince: string | null; backupCodesLeft: number }; sessions: Device[] };

async function api<T = { ok: boolean }>(path: string, method = 'POST', body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result as T;
}
const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
function deviceName(agent: string) {
  const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const system = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Android/.test(agent) ? 'Android' : /Windows/.test(agent) ? 'Windows' : /Mac OS X/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : 'Unknown device';
  return { label: `${browser} on ${system}`, phone: /iPhone|Android|iPad/.test(agent) };
}

function Card({ icon, title, status, children }: { icon: React.ReactNode; title: string; status?: React.ReactNode; children: React.ReactNode }) {
  return <section className={styles.settingsCard}><header><span className={styles.settingsIcon}>{icon}</span><h2>{title}</h2>{status}</header>{children}</section>;
}
const On = ({ children }: { children: React.ReactNode }) => <span className={styles.pillOn}>{children}</span>;
const Off = ({ children }: { children: React.ReactNode }) => <span className={styles.pillOff}>{children}</span>;

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  return <div className={styles.codesBox} role="status">
    <p><strong>Save these backup codes.</strong> Each one works once if you lose your phone. They are not shown again.</p>
    <ol className={styles.codes}>{codes.map((code) => <li key={code}>{code}</li>)}</ol>
    <div className={styles.inlineActions}>
      <button type="button" className={styles.secondary} onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.success('Codes copied.'))}><FiCopy /> Copy</button>
      <a className={styles.secondary} download="backpagenew-backup-codes.txt" href={'data:text/plain;charset=utf-8,' + encodeURIComponent('BackpageNew backup codes\n\n' + text + '\n')}>Download</a>
      <button type="button" className={styles.primary} onClick={onDone}><FiCheck /> I saved them</button>
    </div>
  </div>;
}

export function AccountSettings({ member }: { member: MemberSession }) {
  const [data, setData] = useState<Security | null>(null);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codeAction, setCodeAction] = useState<'disable' | 'codes' | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    try { setData(await api<Security>('/api/account/security', 'GET')); setFailed(''); } catch (error) { setFailed((error as Error).message); }
  }, []);
  useEffect(() => {
    let live = true;
    api<Security>('/api/account/security', 'GET').then((value) => { if (live) setData(value); }).catch((error: Error) => { if (live) setFailed(error.message); });
    return () => { live = false; };
  }, []);

  async function run(name: string, work: () => Promise<void>) {
    setBusy(name);
    try { await work(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(''); }
  }
  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    if (values.get('password') !== values.get('confirm')) { toast.error('The new passwords do not match.'); return; }
    void run('password', async () => {
      await api('/api/account/password', 'POST', { current: String(values.get('current') || ''), password: String(values.get('password')) });
      form.reset(); toast.success('Password changed. Other devices were signed out.'); await load();
    });
  };
  const startSetup = () => run('setup', async () => { setSetup(await api<{ secret: string; qrSvg: string }>('/api/account/two-factor/setup')); });
  const enable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const code = String(new FormData(event.currentTarget).get('code'));
    void run('enable', async () => { const result = await api<{ backupCodes: string[] }>('/api/account/two-factor/enable', 'POST', { code }); setSetup(null); setCodes(result.backupCodes); toast.success('Two-step verification is on.'); await load(); });
  };
  const confirmCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const code = String(new FormData(event.currentTarget).get('code'));
    void run('code', async () => {
      if (codeAction === 'disable') { await api('/api/account/two-factor/disable', 'POST', { code }); toast.success('Two-step verification is off.'); }
      else { const result = await api<{ backupCodes: string[] }>('/api/account/two-factor/backup-codes', 'POST', { code }); setCodes(result.backupCodes); }
      setCodeAction(null); await load();
    });
  };
  const signOutOthers = () => run('others', async () => { const result = await api<{ signedOut: number }>('/api/account/sessions/sign-out-others'); toast.success(result.signedOut ? `Signed out ${result.signedOut} other device${result.signedOut === 1 ? '' : 's'}.` : 'No other devices were signed in.'); await load(); });
  const signOutOne = (device: Device) => run('device-' + device.id, async () => { await api('/api/account/sessions/' + device.id, 'DELETE'); toast.success('Device signed out.'); await load(); });
  const resendEmail = () => run('email', async () => { await api('/api/auth/resend-verification'); toast.success('A new verification email has been sent.'); });
  const deleteAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    void run('delete', async () => {
      await api('/api/account', 'DELETE', { confirm: String(values.get('confirm')), password: String(values.get('password') || ''), code: String(values.get('code') || '') });
      window.location.replace('/?account=deleted');
    });
  };

  if (member.actorId) return <section className={styles.formWidth}><h1>Account settings</h1><p className={styles.notice}>Account settings are not available during a support session.</p></section>;
  if (failed && !data) return <section className={styles.formWidth}><h1>Account settings</h1><p className={styles.error}>{failed}</p><button type="button" className={styles.secondary} onClick={() => void load()}>Retry</button></section>;
  if (!data) return <PageLoader label="Loading your settings" />;
  const { account, sessions } = data;
  const others = sessions.filter((device) => !device.current).length;

  return <section className={styles.settings}>
    <h1>Account settings</h1>

    <Card icon={<FiUser />} title="Profile">
      <dl className={styles.profileFacts}>
        <div><dt>Username</dt><dd>@{member.username}</dd></div>
        <div><dt>Email</dt><dd>{member.email}</dd></div>
        <div><dt>Email status</dt><dd>{member.emailVerified ? <On>Verified</On> : <><Off>Not verified</Off> <button type="button" className={styles.linkButton} disabled={busy === 'email'} onClick={() => void resendEmail()}><FiMail /> Resend email</button></>}</dd></div>
        <div><dt>Profile badge</dt><dd>{member.verified || member.verificationStatus === 'approved' ? <On>Verified</On> : <Link href="/myaccount/verification">Get verified</Link>}</dd></div>
        <div><dt>Sign-in</dt><dd>{account.google ? 'Google and email' : 'Email and password'}</dd></div>
        <div><dt>Member since</dt><dd>{date(account.createdAt)}</dd></div>
      </dl>
    </Card>

    <Card icon={<FiKey />} title={account.passwordSet ? 'Change password' : 'Set a password'} status={account.passwordChangedAt ? <span className={styles.muted}>Changed {date(account.passwordChangedAt)}</span> : undefined}>
      <form className={styles.form} onSubmit={changePassword}>
        <div className={styles.fields}>
          {account.passwordSet && <label className={styles.full}>Current password<PasswordField name="current" autoComplete="current-password" required /></label>}
          <label>New password<PasswordField name="password" autoComplete="new-password" minLength={12} placeholder="At least 12 characters" required /></label>
          <label>Confirm new password<PasswordField name="confirm" autoComplete="new-password" minLength={12} required /></label>
        </div>
        <div><button type="submit" className={styles.primary} disabled={busy === 'password'}>{busy === 'password' ? 'Saving…' : account.passwordSet ? 'Change password' : 'Set password'}</button></div>
      </form>
    </Card>

    <Card icon={<FiShield />} title="Two-step verification" status={account.twoFactor ? <On>On</On> : <Off>Off</Off>}>
      {codes ? <BackupCodes codes={codes} onDone={() => setCodes(null)} /> : account.twoFactor ? <>
        <p className={styles.cardText}>Logging in asks for a code from your authenticator app. On since {date(account.twoFactorSince)} · {account.backupCodesLeft} backup code{account.backupCodesLeft === 1 ? '' : 's'} left.</p>
        {codeAction ? <form className={styles.inlineForm} onSubmit={confirmCode}>
          <label>{codeAction === 'disable' ? 'Code to turn it off' : 'Code to make new backup codes'}<input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456 or backup code" required maxLength={20} autoFocus /></label>
          <button type="submit" className={codeAction === 'disable' ? styles.danger : styles.primary} disabled={busy === 'code'}>{codeAction === 'disable' ? 'Turn off' : 'Continue'}</button>
          <button type="button" className={styles.secondary} onClick={() => setCodeAction(null)}>Cancel</button>
        </form> : <div className={styles.inlineActions}>
          <button type="button" className={styles.secondary} onClick={() => setCodeAction('codes')}>New backup codes</button>
          <button type="button" className={styles.danger} onClick={() => setCodeAction('disable')}>Turn off</button>
        </div>}
      </> : setup ? <div className={styles.setup}>
        <div className={styles.qr} aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
        <div>
          <ol className={styles.steps}><li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</li><li>Scan the QR code, or enter this key:<code className={styles.secret}>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code></li><li>Enter the 6-digit code it shows.</li></ol>
          <form className={styles.inlineForm} onSubmit={enable}>
            <label>Code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" required autoFocus /></label>
            <button type="submit" className={styles.primary} disabled={busy === 'enable'}>Turn on</button>
            <button type="button" className={styles.secondary} onClick={() => setSetup(null)}>Cancel</button>
          </form>
        </div>
      </div> : <>
        <p className={styles.cardText}>Add a code from your phone to every login, so a stolen password alone cannot open your account.</p>
        <div><button type="button" className={styles.primary} disabled={busy === 'setup'} onClick={() => void startSetup()}><FiSmartphone /> Set up</button></div>
      </>}
    </Card>

    <Card icon={<FiMonitor />} title="Signed-in devices" status={<span className={styles.muted}>{sessions.length}</span>}>
      <ul className={styles.devices}>{sessions.map((device) => { const name = deviceName(device.userAgent); return <li key={device.id}>
        <span className={styles.deviceIcon}>{name.phone ? <FiSmartphone /> : <FiMonitor />}</span>
        <div><strong>{device.userAgent ? name.label : 'Unknown device'}</strong><small>{device.current ? 'This device' : 'Signed in ' + date(device.createdAt)}{device.country ? ' · ' + device.country : ''}{device.ip ? ' · ' + device.ip : ''}</small></div>
        {device.current ? <On>Current</On> : <button type="button" className={styles.linkButton} disabled={busy === 'device-' + device.id} onClick={() => void signOutOne(device)}>Sign out</button>}
      </li>; })}</ul>
      {others > 0 && <div><button type="button" className={styles.secondary} disabled={busy === 'others'} onClick={() => void signOutOthers()}><FiLogOut /> Sign out all other devices</button></div>}
    </Card>

    <Card icon={<FiAlertTriangle />} title="Delete account">
      <p className={styles.cardText}>Your account and all of your ads are removed. This cannot be undone.</p>
      <div><button type="button" className={styles.danger} onClick={() => deleteDialog.current?.showModal()}><FiTrash2 /> Delete my account</button></div>
    </Card>

    <dialog ref={deleteDialog} className={styles.confirmDialog} aria-labelledby="delete-account-title">
      <form className={styles.form} onSubmit={deleteAccount}>
        <h2 id="delete-account-title">Delete your account?</h2>
        <p>All {member.posts.length} of your ads are removed from the site and you are signed out everywhere.</p>
        {account.passwordSet && <label>Password<PasswordField name="password" autoComplete="current-password" required /></label>}
        {account.twoFactor && <label>Authenticator or backup code<input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={20} /></label>}
        <label>Type DELETE to confirm<input name="confirm" autoComplete="off" pattern="DELETE" required /></label>
        <div className={styles.inlineActions}>
          <button type="button" className={styles.secondary} onClick={() => deleteDialog.current?.close()}>Cancel</button>
          <button type="submit" className={styles.danger} disabled={busy === 'delete'}>{busy === 'delete' ? 'Deleting…' : 'Delete account'}</button>
        </div>
      </form>
    </dialog>
  </section>;
}
