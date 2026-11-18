'use client';

import { useState, type FormEvent } from 'react';
import { FiCheckCircle } from 'react-icons/fi';
import { SiteSelect } from '../../components/site-select';
import { FeedbackToast } from '../../components/toast';
import { Turnstile } from '../../components/turnstile';

const topics = ['General question', 'Account or login', 'An ad', 'Wallet and payments', 'Report a problem', 'Legal or privacy'];

export function ContactForm() {
  const [topic, setTopic] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('');
    if (!topic) { setMessage('Choose a topic.'); return; }
    if (!captchaToken) { setMessage('Complete the security check first.'); return; }
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), topic, message: String(data.get('message')).trim(), captchaToken }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your message could not be sent. Please try again.');
      setSent(true);
    } catch (error) { setMessage((error as Error).message); setCaptchaToken(''); setAttempt((value) => value + 1); }
    finally { setBusy(false); }
  }

  if (sent) return <div className="contact-sent" role="status"><FiCheckCircle /><h2>Message sent</h2><p>Thanks. We reply by email, usually within 1–2 business days.</p></div>;
  return <form className="contact-form" onSubmit={submit}>
    <div className="contact-row">
      <label>Name<input name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
    </div>
    <SiteSelect label="Topic" name="topic" value={topic} onChange={setTopic} required options={topics.map((label) => ({ value: label, label }))} placeholder="Choose a topic" />
    <label>Message<textarea name="message" rows={6} required minLength={20} maxLength={4000} placeholder="How can we help? For an ad, include its number." /></label>
    <Turnstile key={attempt} onToken={setCaptchaToken} onError={() => setMessage('Security check could not load. Please refresh and try again.')} />
    <FeedbackToast message={message} />
    <button type="submit" className="contact-submit" disabled={busy || !captchaToken}>{busy ? 'Sending…' : 'Send message'}</button>
  </form>;
}
