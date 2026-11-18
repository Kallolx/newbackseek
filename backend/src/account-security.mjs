// Member account security: change password, two-step verification (authenticator app + backup codes),
// signed-in devices, and deleting the account. Also the second step of logging in when 2-step is on.
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { sql, audit } from './db.mjs';
import { redis } from './queue.mjs';
import { config } from './config.mjs';
import { digest, token, hashPassword, verifyPassword } from './security.mjs';

import { base32Encode, matchTotp } from './totp.mjs';
const newBackupCodes = () => Array.from({ length: 10 }, () => { const raw = randomBytes(5).toString('hex'); return raw.slice(0, 5) + '-' + raw.slice(5); });
const normalizeBackup = (code) => code.trim().toLowerCase().replace(/[^a-f0-9]/g, '');

/** Checks an authenticator code or a one-time backup code for this user (and uses it up). */
export async function useSecondFactor(userId, rawCode) {
  const code = String(rawCode || '').trim().replace(/\s+/g, '');
  const [user] = await sql`select totp_secret,totp_last_counter,backup_codes from users where id=${userId} and totp_enabled_at is not null`;
  if (!user) return false;
  const counter = matchTotp(user.totp_secret, code);
  if (counter !== null) {
    // A code works once: refuse the same (or an older) code again.
    const used = await sql`update users set totp_last_counter=${counter} where id=${userId} and (totp_last_counter is null or totp_last_counter<${counter}) returning id`;
    return used.length > 0;
  }
  const hashed = digest('backup:' + normalizeBackup(code));
  if (normalizeBackup(code).length !== 10) return false;
  const used = await sql`update users set backup_codes=array_remove(backup_codes,${hashed}) where id=${userId} and ${hashed}=any(backup_codes) returning id`;
  return used.length > 0;
}

// ---- Second step of logging in ----
const ticketCookie = config.NODE_ENV === 'production' ? '__Host-bpn-2fa' : 'bpn-2fa';
const ticketKey = (value) => 'bpn:2fa:' + digest(value);
/** When 2-step is on, parks the login (5 minutes) and returns true instead of signing in. */
export async function startSecondStep(reply, user) {
  if (!user.totp_enabled_at) return false;
  const value = token();
  await redis.set(ticketKey(value), JSON.stringify({ userId: user.id, tries: 0 }), 'EX', 300);
  reply.setCookie(ticketCookie, value, { path: '/', httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 300 });
  return true;
}

const password = z.string().min(12, 'Use at least 12 characters for your password').max(128);
const code = z.string().trim().min(6).max(20);

export function accountSecurity(app, { member, fail, session, sessionCookie, cookieOptions }) {
  const owner = async (req) => {
    await member(req);
    if (req.user.role !== 'member') throw fail(403, 'Not available for this account');
    if (req.user.actor_id) throw fail(403, 'Not available during a support session');
  };
  const currentHash = (req) => digest(req.cookies[sessionCookie(req)] || '');

  app.post('/api/auth/login/two-factor', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const input = z.object({ code }).parse(req.body);
    const value = req.cookies[ticketCookie];
    const raw = value && await redis.get(ticketKey(value));
    if (!raw) throw fail(401, 'Your sign-in expired. Log in again.');
    const ticket = JSON.parse(raw);
    if (!(await useSecondFactor(ticket.userId, input.code))) {
      ticket.tries += 1;
      if (ticket.tries >= 5) { await redis.del(ticketKey(value)); reply.clearCookie(ticketCookie, { path: '/', secure: cookieOptions.secure }); throw fail(401, 'Too many wrong codes. Log in again.'); }
      await redis.set(ticketKey(value), JSON.stringify(ticket), 'KEEPTTL');
      throw fail(400, 'That code is not right. Try the newest code from your app, or a backup code.');
    }
    await redis.del(ticketKey(value));
    reply.clearCookie(ticketCookie, { path: '/', secure: cookieOptions.secure });
    const [user] = await sql`select id,email,username,role from users where id=${ticket.userId} and status='active' and role='member'`;
    if (!user) throw fail(401, 'This account is unavailable');
    await session(reply, user.id);
    await audit(sql, user.id, 'account.login.two_factor', user.id);
    return { user };
  });

  app.get('/api/account/security', { preHandler: owner }, async (req) => {
    const [user] = await sql`select created_at,email_verified_at,password_set,password_changed_at,totp_enabled_at,cardinality(backup_codes) as backup_codes_left,(google_subject is not null) as google from users where id=${req.user.id}`;
    const sessions = await sql`select token_hash,created_at,expires_at,user_agent,ip,country from sessions where user_id=${req.user.id} and expires_at>now() and actor_id is null order by created_at desc limit 20`;
    const current = currentHash(req);
    return {
      account: { createdAt: user.created_at, passwordSet: user.password_set, passwordChangedAt: user.password_changed_at, google: user.google, twoFactor: Boolean(user.totp_enabled_at), twoFactorSince: user.totp_enabled_at, backupCodesLeft: Number(user.backup_codes_left) },
      sessions: sessions.map((row) => ({ id: row.token_hash.slice(0, 16), current: row.token_hash === current, createdAt: row.created_at, userAgent: row.user_agent || '', ip: row.ip || '', country: row.country || '' })),
    };
  });

  app.post('/api/account/password', { preHandler: owner, config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (req) => {
    const input = z.object({ current: z.string().max(128).default(''), password }).parse(req.body);
    const [user] = await sql`select password_hash,password_set from users where id=${req.user.id}`;
    if (user.password_set && !(await verifyPassword(input.current, user.password_hash))) throw fail(400, 'Your current password is not right.');
    if (input.current && input.current === input.password) throw fail(400, 'Choose a password different from your current one.');
    const hash = await hashPassword(input.password);
    await sql.begin(async (tx) => {
      await tx`update users set password_hash=${hash},password_set=true,password_changed_at=now() where id=${req.user.id}`;
      // Every other device must log in again with the new password.
      await tx`delete from sessions where user_id=${req.user.id} and token_hash<>${currentHash(req)}`;
      await tx`delete from password_resets where user_id=${req.user.id}`;
      await audit(tx, req.user.id, 'account.password', req.user.id);
    });
    return { ok: true };
  });

  app.post('/api/account/two-factor/setup', { preHandler: owner }, async (req) => {
    const [user] = await sql`select totp_enabled_at from users where id=${req.user.id}`;
    if (user.totp_enabled_at) throw fail(409, 'Two-step verification is already on.');
    const secret = base32Encode(randomBytes(20));
    await sql`update users set totp_pending_secret=${secret} where id=${req.user.id}`;
    const label = encodeURIComponent('BackpageNew:' + req.user.email);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=BackpageNew&algorithm=SHA1&digits=6&period=30`;
    const qrSvg = await QRCode.toString(otpauth, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { secret, otpauth, qrSvg };
  });

  app.post('/api/account/two-factor/enable', { preHandler: owner, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const input = z.object({ code }).parse(req.body);
    const [user] = await sql`select totp_pending_secret,totp_enabled_at from users where id=${req.user.id}`;
    if (user.totp_enabled_at) throw fail(409, 'Two-step verification is already on.');
    if (!user.totp_pending_secret) throw fail(400, 'Start the setup again.');
    const counter = matchTotp(user.totp_pending_secret, input.code.replace(/\s+/g, ''));
    if (counter === null) throw fail(400, 'That code is not right. Check the time on your phone and use the newest code.');
    const codes = newBackupCodes();
    await sql.begin(async (tx) => {
      await tx`update users set totp_secret=totp_pending_secret,totp_pending_secret=null,totp_enabled_at=now(),totp_last_counter=${counter},backup_codes=${codes.map((item) => digest('backup:' + normalizeBackup(item)))} where id=${req.user.id}`;
      await tx`delete from sessions where user_id=${req.user.id} and token_hash<>${currentHash(req)}`;
      await audit(tx, req.user.id, 'account.two_factor.on', req.user.id);
    });
    return { backupCodes: codes };
  });

  app.post('/api/account/two-factor/backup-codes', { preHandler: owner, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const input = z.object({ code }).parse(req.body);
    if (!(await useSecondFactor(req.user.id, input.code))) throw fail(400, 'That code is not right.');
    const codes = newBackupCodes();
    await sql`update users set backup_codes=${codes.map((item) => digest('backup:' + normalizeBackup(item)))} where id=${req.user.id}`;
    await audit(sql, req.user.id, 'account.two_factor.codes', req.user.id);
    return { backupCodes: codes };
  });

  app.post('/api/account/two-factor/disable', { preHandler: owner, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const input = z.object({ code }).parse(req.body);
    if (!(await useSecondFactor(req.user.id, input.code))) throw fail(400, 'That code is not right.');
    await sql`update users set totp_secret=null,totp_pending_secret=null,totp_enabled_at=null,totp_last_counter=null,backup_codes='{}' where id=${req.user.id}`;
    await audit(sql, req.user.id, 'account.two_factor.off', req.user.id);
    return { ok: true };
  });

  app.post('/api/account/sessions/sign-out-others', { preHandler: owner }, async (req) => {
    const removed = await sql`delete from sessions where user_id=${req.user.id} and token_hash<>${currentHash(req)} and actor_id is null returning token_hash`;
    await audit(sql, req.user.id, 'account.sessions.revoke', req.user.id, { count: removed.length });
    return { signedOut: removed.length };
  });

  app.delete('/api/account/sessions/:id', { preHandler: owner }, async (req) => {
    const id = z.string().regex(/^[a-f0-9]{16}$/).parse(req.params.id);
    const removed = await sql`delete from sessions where user_id=${req.user.id} and left(token_hash,16)=${id} and token_hash<>${currentHash(req)} returning token_hash`;
    if (!removed.length) throw fail(404, 'That device is already signed out.');
    return { ok: true };
  });

  app.delete('/api/account', { preHandler: owner, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const input = z.object({ confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }), password: z.string().max(128).default(''), code: z.string().max(20).default('') }).parse(req.body);
    const [user] = await sql`select password_hash,password_set,totp_enabled_at from users where id=${req.user.id}`;
    if (user.password_set && !(await verifyPassword(input.password, user.password_hash))) throw fail(400, 'Your password is not right.');
    if (user.totp_enabled_at && !(await useSecondFactor(req.user.id, input.code))) throw fail(400, 'Enter a code from your authenticator app or a backup code.');
    await sql.begin(async (tx) => {
      await tx`update users set status='deleted',totp_secret=null,totp_pending_secret=null,backup_codes='{}' where id=${req.user.id}`;
      await tx`update ads set status='deleted',updated_at=now() where owner_id=${req.user.id} and status<>'deleted'`;
      await tx`delete from sessions where user_id=${req.user.id}`;
      await tx`delete from email_verifications where user_id=${req.user.id}`;
      await tx`delete from password_resets where user_id=${req.user.id}`;
      await tx`update verifications set status='rejected' where user_id=${req.user.id} and status='pending'`;
      await audit(tx, req.user.id, 'account.delete', req.user.id);
    });
    reply.clearCookie(sessionCookie(req), { path: '/', secure: cookieOptions.secure });
    return { ok: true };
  });
}
