import nodemailer from 'nodemailer';
import { config } from './config.mjs';
import { accountEmail } from './email-template.mjs';

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
    html: accountEmail({origin:config.SITE_ORIGIN,title:'Verify your email address',preheader:'One quick step before you can sign in to BackpageNew.',greeting:`Hi ${username},`,description:'Thanks for joining BackpageNew. Confirm this email address to activate your account and sign in.',button:'Verify email address',url:url.toString(),expiry:'This verification link expires in 24 hours.',security:'Didn’t create this account? You can safely ignore this email. BackpageNew will never ask you to share your password by email or chat.'}),
  });
}

export async function sendPasswordResetEmail({email,resetToken}) {
 if(!transporter||!email)throw new Error('Password reset email is not configured');
 const url=new URL('/auth',config.SITE_ORIGIN);url.searchParams.set('mode','newpassword');url.searchParams.set('token',resetToken);
 await transporter.sendMail({from:config.EMAIL_FROM,to:email,subject:'Reset your BackpageNew password',text:`Reset your password using this link:\n${url}\n\nThis link expires in 30 minutes and can only be used once. If you did not request it, ignore this email.`,html:accountEmail({origin:config.SITE_ORIGIN,title:'Choose a new password',preheader:'Your secure BackpageNew password reset link.',greeting:'Let’s get you back into your account.',description:'We received a request to reset your password. Use the button below to choose a new, unique password.',button:'Reset password',url:url.toString(),expiry:'This link expires in 30 minutes and can only be used once.',security:'Didn’t request a password reset? Ignore this email—your password stays unchanged. Never share this link or your password with anyone.'})});
}

export async function sendContactMessage({id,name,email,topic,message}) {
 if(!transporter)throw new Error('Email delivery is not configured');
 await transporter.sendMail({from:config.EMAIL_FROM,to:config.CONTACT_EMAIL,replyTo:{name,address:email},subject:`[Contact #${id}] ${topic} — ${name}`.slice(0,180),text:`From: ${name} <${email}>\nTopic: ${topic}\nMessage #${id}\n\n${message}`});
}
