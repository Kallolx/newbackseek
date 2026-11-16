'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FiShield, FiUser, FiCamera, FiCheckCircle, FiX, FiLock } from 'react-icons/fi';
import { EmptyState } from '../components/page-state';
import { type MemberSession } from './session';
import styles from './member.module.css';

export function Verification({ member }: { member: MemberSession }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [date] = useState(() => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  function select(file?: File) {
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP picture smaller than 5 MB.'); return; }
    setPhoto(file);
    setUrl(URL.createObjectURL(file));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo) { setError('Add your verification photo before submitting.'); return; }
    try {
      const create = await fetch('/api/media/uploads', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes: photo.size, contentType: photo.type, purpose: 'verification' }) });
      const upload = await create.json();
      if (!create.ok) throw new Error(upload.error || 'Could not prepare your verification upload.');
      const put = await fetch(upload.url, { method: 'PUT', headers: { 'content-type': photo.type }, body: photo });
      if (!put.ok) throw new Error('Could not upload your photo.');
      await fetch(`/api/media/${upload.id}/complete`, { method: 'POST', credentials: 'same-origin' });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const status = await fetch(`/api/media/${upload.id}`, { credentials: 'same-origin', cache: 'no-store' }).then((response) => response.json());
        if (status.status === 'ready') break;
        if (status.status === 'failed') throw new Error('The photo could not be processed. Please choose another one.');
        if (attempt === 19) throw new Error('Photo processing is taking longer than expected. Please try again shortly.');
      }
      const details = new FormData(event.currentTarget);
      const request = await fetch('/api/account/verification', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mediaId: upload.id, notes: String(details.get('additionalInformation') || '') }) });
      const result = await request.json().catch(() => ({}));
      if (!request.ok) throw new Error(result.error || 'We could not submit your request.');
      setSubmitted(true); setPhoto(null); setUrl('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'We could not save your request. Please try again.'); }
  }
  return <section className={styles.formWidth}>
    <div className={styles.verifyHeading}><span><FiShield aria-hidden="true" /></span><div><h1>Verify your account</h1><p>A clear photo helps us confirm your profile.</p></div></div>
    {submitted ? <div className={styles.verifySuccess} role="status"><FiCheckCircle aria-hidden="true" /><h2>Verification request submitted</h2><p>Your private photo is securely stored for review. It will never appear on a public ad.</p><button type="button" className={styles.secondary} onClick={() => setSubmitted(false)}>Review photo requirements</button></div> : <>
      <p className={styles.intro}>Follow the steps below to prepare your verification photo. Your verification picture is separate from your public ad pictures.</p>
      <section className={styles.verifyInstructions}><h2><span>1</span> Prepare your handwritten note</h2><p>Write these details clearly on a piece of paper:</p><ul><li>Username <strong>{member.username}</strong></li><li>Current date <strong>{date}</strong></li><li>Email <strong>{member.email}</strong></li></ul></section>
      <section className={styles.verifyInstructions}><h2><span>2</span> Take a clear photo</h2><p>Hold the note beside you. Your face, arm and the entire note should be visible. Use good lighting, no filters or edits, and write the details by hand in English.</p>
        <div className={styles.verifyExample} aria-label="Illustrated example of a person holding a verification note"><FiUser aria-hidden="true" /><div><span>Handwritten note</span><strong>{member.username}</strong><span>{date}</span><span>{member.email}</span></div></div><p className={styles.help}>Illustrated example · keep both your face and the note in the frame.</p>
      </section>
      <form onSubmit={submit} className={styles.form}>
        <section className={styles.verifyInstructions}><h2><span>3</span> Add your verification photo</h2>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Verification photo" onChange={(event) => select(event.target.files?.[0])} />
          {photo && url ? <div className={styles.verifyPreview}><Image src={url} alt="Your selected verification photo" width={600} height={450} unoptimized onError={() => { setPhoto(null); setUrl(''); setError('This picture could not be opened. Please choose another image.'); }} /><div><span>{photo.name}</span><button type="button" className={styles.secondary} aria-label="Remove verification photo" onClick={() => { setPhoto(null); setUrl(''); if (input.current) input.current.value = ''; }}><FiX /> Remove</button></div></div> : <EmptyState kind="photo" compact title="Your verification photo goes here" description="Choose a clear picture with your face and handwritten note visible. JPG, PNG or WebP, up to 5 MB." action="Choose a photo" onAction={() => input.current?.click()} />}
          {photo && <button className={styles.secondary} type="button" onClick={() => input.current?.click()}><FiCamera /> Choose a different photo</button>}
        </section>
        <label>Additional information <span className={styles.help}>Optional</span><textarea name="additionalInformation" rows={4} maxLength={1000} placeholder="Links to verified profiles or any details that may help with your review…" /></label>
        <label className={styles.check}><input type="checkbox" required /><span>I confirm that the photo is unedited, my face is clearly visible, and my handwritten details are included.</span></label>
        <p className={styles.notice}><strong>Private review:</strong> This picture is stored separately from public ad images and is visible only to authorized reviewers.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" className={styles.primary}><FiShield aria-hidden="true" /> Submit for verification</button>
      </form>
      <div className={styles.verifyPrivacy}><FiLock aria-hidden="true" /><p><strong>Your privacy matters.</strong> Verification photos are used only for account review and never appear on public ads.</p></div>
    </>}
  </section>;
}
