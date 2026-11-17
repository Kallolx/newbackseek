import nodemailer from 'nodemailer';
import { config } from './config.mjs';

const configured = Boolean(
  config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER && config.SMTP_PASSWORD && config.EMAIL_FROM,
);

const transporter = configured
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE === 'true',
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    })
  : null;

export function emailReady() {
  return Boolean(transporter);
}

export async function verifyEmailTransport() {
  if (!transporter) throw new Error('Email delivery is not configured');
  await transporter.verify();
}

export async function sendVerificationEmail({ email, username, verificationToken }) {
  if (!transporter) throw new Error('Email delivery is not configured');
  if (!email) throw new Error('Verification email recipient is required');
  const url = new URL('/api/auth/verify-email', config.SITE_ORIGIN);
  url.searchParams.set('token', verificationToken);
  await transporter.sendMail({
    from: config.EMAIL_FROM,
    to: email,
    subject: 'Verify your BackpageNew email address',
    text: `Hi ${username},\n\nVerify your email address to finish setting up your BackpageNew account:\n${url}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`,
    html: `<p>Hi ${escapeHtml(username)},</p><p>Verify your email address to finish setting up your BackpageNew account.</p><p><a href="${url.toString()}">Verify email address</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>`,
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}
