import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

test('verification delivery addresses the registered user and includes the verification link', async () => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://unused:unused@localhost/unused', REDIS_URL: 'redis://localhost:6379',
    SITE_ORIGIN: 'https://backpagenew.com', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465',
    SMTP_SECURE: 'true', SMTP_USER: 'support@example.com', SMTP_PASSWORD: 'test-only', EMAIL_FROM: 'support@example.com',
  });
  const sent = [];
  const transport = mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => { sent.push(message); } }));
  try {
    const { sendVerificationEmail } = await import('../src/email.mjs');
    await sendVerificationEmail({ email: 'newuser@example.com', username: 'NewUser', verificationToken: 'test-token' });
    assert.equal(sent[0].to, 'newuser@example.com');
    assert.match(sent[0].text, /https:\/\/backpagenew.com\/api\/auth\/verify-email\?token=test-token/);
    await assert.rejects(sendVerificationEmail({ username: 'MissingEmail', verificationToken: 'test-token' }), /recipient is required/);
    assert.equal(sent.length, 1);
  } finally { transport.mock.restore(); }
});
