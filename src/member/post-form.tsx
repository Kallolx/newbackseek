'use client';

import { FeedbackToast } from '../components/toast';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { FiMapPin, FiInfo, FiImage, FiShield, FiUploadCloud, FiX } from 'react-icons/fi';
import { SiteSelect } from '../components/site-select';
import { countries } from '../directory/areas';
import { serviceGroups } from '../directory/service-groups';
import { type MemberSession } from './session';
import styles from './member.module.css';
import { DescriptionEditor } from './description-editor';

async function preparePhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Choose JPG, PNG, WebP or AVIF images.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Each picture must be under 5 MB.');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('Could not prepare this image.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not prepare this image.')), 'image/webp', 0.75));
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}

export function MemberPostForm({ member }: { member: MemberSession }) {
  const router = useRouter();
  const [countryCode, setCountry] = useState('');
  const [regionHref, setRegion] = useState('');
  const [cityHref, setCity] = useState('');
  const [groupName, setGroup] = useState('');
  const [serviceSlug, setService] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [pictures, setPictures] = useState<{ preview: string; file: File }[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const country = countries.find((item) => item.code === countryCode);
  const region = country?.regions.find((item) => item.href === regionHref);
  const city = region?.cities.find((item) => item.href === cityHref);
  const group = serviceGroups.find((item) => item.name === groupName);
  const service = group?.services.find((item) => item.slug === serviceSlug);

  async function addPictures(files: File[]) {
    if (busy.current || !files.length) return;
    setPhotoError('');
    if (pictures.length + files.length > 6) { setPhotoError('You can add up to 6 pictures.'); return; }
    busy.current = true;
    try {
      const prepared: { preview: string; file: File }[] = [];
      for (const file of files) {
        if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type) || file.size > 5*1024*1024) throw new Error('Choose JPG, PNG, WebP or AVIF pictures under 5 MB.');
        prepared.push({file,preview:URL.createObjectURL(file)});
      }
      setPictures((previous) => [...previous, ...prepared]);
    } catch (cause) { setPhotoError(cause instanceof Error ? cause.message : 'Could not open this image. Try another file.'); }
    finally { busy.current = false; if (fileInput.current) fileInput.current.value = ''; }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!country || !region || !city || !group || !service) { setError('Choose your country, state or region, city, category and subcategory.'); return; }
    if (processing) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get('headline')).trim();
    const location = String(data.get('location')).trim();
    const phone = String(data.get('phone')).trim();
    const age = Number(data.get('age'));
    if (!title || !location || !phone || description.trim().length < 30 || description.length > 2950 || !Number.isInteger(age) || age < 18 || age > 120) {
      setError('Complete all required fields. Use an age of 18 or over and a description between 30 and 2950 characters.'); return;
    }
    setProcessing(true);
    try {
      const locationsResponse = await fetch(`/api/locations?country=${encodeURIComponent(country.code)}&region=${encodeURIComponent(region.name)}`, { credentials: 'same-origin' });
      const locations = await locationsResponse.json();
      const selectedCity = locations.cities?.find((item: { href: string }) => item.href === city.href);
      if (!selectedCity) throw new Error('That city is unavailable. Please choose it again.');
      const mediaIds: string[] = [];
      for (const picture of pictures) {
        const uploadFile = await preparePhoto(picture.file);
        const create = await fetch('/api/media/uploads', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes: uploadFile.size, contentType: uploadFile.type, purpose: 'ad' }) });
        const upload = await create.json();
        if (!create.ok) throw new Error(upload.error || 'Could not prepare an image upload.');
        const put = await fetch(upload.url, { method: 'PUT', headers: { 'content-type': uploadFile.type }, body: uploadFile });
        if (!put.ok) throw new Error('Could not upload an image.');
        const complete = await fetch(`/api/media/${upload.id}/complete`, { method: 'POST', credentials: 'same-origin' });
        if (!complete.ok) throw new Error('Could not finish an image upload.');
        let ready = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 750));
          const statusResponse = await fetch(`/api/media/${upload.id}`, { credentials: 'same-origin', cache: 'no-store' });
          const status = await statusResponse.json();
          if (status.status === 'ready') { ready = true; break; }
          if (status.status === 'failed') throw new Error('An image could not be processed. Please choose another picture.');
        }
        if (!ready) throw new Error('Image processing is taking longer than expected. Please try again in a moment.');
        mediaIds.push(upload.id);
      }
      const response = await fetch('/api/account/ads', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, description: description.trim(), categorySlug: service.slug, age, location, phone, cityIds: [Number(selectedCity.id)], mediaIds }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not submit your ad.');
      window.dispatchEvent(new Event('bpn-session-change'));
      router.replace('/myaccount'); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit your ad.'); }
    finally { setProcessing(false); }
  }

  return <div className={styles.formWidth}>
    <h1>Post an Ad</h1><p className={styles.intro}>Choose where your ad appears, then add the details. Required fields are marked *.</p>
    <form className={styles.form} onSubmit={publish}>
      <section className={styles.section} aria-labelledby="post-location-heading">
        <h2 id="post-location-heading"><FiMapPin aria-hidden="true" /> Location & category</h2>
        <div className={styles.fields}>
          <SiteSelect label="Country" required value={countryCode} options={countries.map((item) => ({ value: item.code, label: item.name }))} placeholder="Choose your country" onChange={(value) => { setCountry(value); setRegion(''); setCity(''); }} />
          <SiteSelect label="State or region" required value={regionHref} disabled={!country} placeholder={country ? 'Choose your state or region' : 'Select a country first'} options={country?.regions.map((item) => ({ value: item.href, label: item.name })) ?? []} onChange={(value) => { setRegion(value); setCity(''); }} />
          <SiteSelect label="City" required value={cityHref} disabled={!region} placeholder={region ? 'Pick your city' : 'Select a state or region first'} options={region?.cities.map((item) => ({ value: item.href, label: item.name })) ?? []} onChange={setCity} />
          <SiteSelect label="Category" required value={groupName} placeholder="Choose your category" options={serviceGroups.map((item) => ({ value: item.name, label: item.name }))} onChange={(value) => { setGroup(value); setService(''); }} />
          <SiteSelect label="Subcategory" required value={serviceSlug} disabled={!group} placeholder={group ? 'Choose your subcategory' : 'Select a category first'} options={group?.services.map((item) => ({ value: item.slug, label: item.name })) ?? []} onChange={setService} />
        </div>
      </section>
      <aside className={styles.rules}>
        <h2>Please read before posting</h2>
        <ul><li><strong>Choose the right category.</strong> Keep your ad accurate and relevant.</li><li><strong>Be respectful.</strong> Avoid explicit language, harassment and misleading claims.</li><li><strong>Have permission.</strong> Only upload pictures you own or are allowed to use.</li><li><strong>Follow the law.</strong> No illegal content or services. Read our <Link href="/guidelines">Guidelines</Link>.</li></ul>
      </aside>
      <section className={styles.section} aria-labelledby="post-info-heading">
        <h2 id="post-info-heading"><FiInfo aria-hidden="true" /> Must-have info</h2>
        <div className={styles.fields}>
          <label className={styles.full}>Headline *<input name="headline" required maxLength={150} placeholder="Give your ad a clear, descriptive title" /></label>
          <label>Age *<input name="age" type="number" required min={18} max={120} step={1} inputMode="numeric" placeholder="Your age (18+)" /></label>
          <label>Location *<input name="location" required maxLength={120} placeholder="Neighborhood or nearby area" /></label>
          <label>Phone number *<input name="phone" type="tel" required maxLength={40} autoComplete="tel" placeholder="e.g. +1 202 555 0142" /></label>
          <label>Contact email<input type="email" value={member.email} readOnly /><span className={styles.help}>Update this in Account Settings.</span></label>
          <div className={styles.full}><p className={styles.editorLabel}>Description *</p><DescriptionEditor onChange={(text, html) => { setDescription(text); setDescriptionHtml(html); }} /></div>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="post-pictures-heading">
        <h2 id="post-pictures-heading"><FiImage aria-hidden="true" /> Your pictures <span className={styles.help}>{pictures.length} / 6</span></h2>
        <div className={styles.upload} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addPictures(Array.from(event.dataTransfer.files)); }}>
          <FiUploadCloud aria-hidden="true" /><strong>Add pictures to your ad</strong><p>Drop images here or choose files. JPG, PNG, WebP or AVIF, up to 5 MB each.</p>
          <button className={styles.secondary} type="button" disabled={processing || pictures.length >= 6} onClick={() => fileInput.current?.click()}>{processing ? 'Preparing pictures…' : 'Choose pictures'}</button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden aria-label="Upload ad pictures" onChange={(event) => void addPictures(Array.from(event.target.files ?? []))} />
        </div>
        {pictures.length > 0 && <div className={styles.photos}>{pictures.map((picture, index) => <div key={picture.preview}><Image src={picture.preview} alt={'Ad picture ' + (index + 1)} width={200} height={160} unoptimized />{index === 0 && <span>Cover photo</span>}<button type="button" disabled={processing} aria-label={'Remove picture ' + (index + 1)} onClick={() => setPictures((previous) => previous.filter((_, item) => item !== index))}><FiX /></button></div>)}</div>}
        <p className={styles.help}>Pictures are prepared automatically and optimized after upload.</p>
        <FeedbackToast message={photoError} />
      </section>
      <section className={styles.section} aria-labelledby="post-privacy-heading">
        <h2 id="post-privacy-heading"><FiShield aria-hidden="true" /> Privacy & legal</h2>
        <label className={styles.check}><input type="checkbox" required /><span>I am 18 or older. I have permission to publish this content and agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</span></label>
        <p className={styles.notice}>Your listing is sent for review. Pictures are optimized securely after upload and only approved ads appear publicly.</p>
      </section>
      <FeedbackToast message={error} />
      <div className={styles.publish}><Link href="/myaccount">Cancel</Link><button className={styles.primary} type="submit" disabled={processing}>{processing ? 'Submitting…' : 'Submit ad for review'}</button></div>
    </form>
  </div>;
}
