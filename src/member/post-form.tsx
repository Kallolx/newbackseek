'use client';

import { FeedbackToast } from '../components/toast';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { FiMapPin, FiInfo, FiImage, FiShield, FiUploadCloud, FiX, FiCheck, FiRotateCw, FiAlertCircle } from 'react-icons/fi';
import { SiteSelect } from '../components/site-select';
import { countries } from '../directory/areas';
import { serviceGroups } from '../directory/service-groups';
import { type MemberSession,type MemberPost } from './session';
import { toast } from '../components/toast';
import styles from './member.module.css';
import dynamic from 'next/dynamic';
import { EditorSkeleton } from '../components/skeletons';
// The rich-text editor is the heaviest part of the form: load it separately so the
// rest of the form appears first.
const DescriptionEditor = dynamic(() => import('./description-editor').then((module) => module.DescriptionEditor), { loading: () => <EditorSkeleton /> });
import { usePictureUploads, validatePicture, type PictureUpload } from './picture-uploads';
import { goTo } from './navigation';

type SubmitStep = { title: string; detail: string; step: number };

function ProgressRing({ value }: { value: number }) {
  const radius = 20, circumference = 2 * Math.PI * radius;
  return <svg className={styles.ring} viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r={radius} className={styles.ringTrack} /><circle cx="24" cy="24" r={radius} className={styles.ringValue} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} /></svg>;
}

function UploadTile({ item, index, cover, onRemove, onRetry, disabled }: { item: PictureUpload; index: number; cover: boolean; onRemove: () => void; onRetry: () => void; disabled: boolean }) {
  // Before submit the picture is shown as-is; the ring only appears while it uploads.
  return <div className={styles.uploadTile} data-stage={item.stage}>
    <Image src={item.preview} alt={'Ad picture ' + (index + 1)} width={200} height={160} unoptimized />
    {item.stage === 'uploading' && <div className={styles.tileProgress} role="progressbar" aria-label={`Picture ${index + 1} uploading`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}><ProgressRing value={item.progress} /><strong>{item.progress}%</strong></div>}
    {item.stage === 'uploaded' && <span className={styles.tileDone} aria-label={`Picture ${index + 1} uploaded`}><FiCheck aria-hidden="true" /></span>}
    {item.stage === 'failed' && <div className={styles.tileFailed} title={item.error}><FiAlertCircle aria-hidden="true" /><small>Failed<span className={styles.srOnly}>: {item.error || 'Upload failed'}</span></small><button type="button" className={styles.tileRetry} onClick={onRetry}><FiRotateCw aria-hidden="true" /> Retry</button></div>}
    {cover && item.stage !== 'failed' && <span className={styles.coverLabel}>Cover photo</span>}
    <button type="button" className={styles.tileRemove} disabled={disabled} aria-label={'Remove picture ' + (index + 1)} onClick={onRemove}><FiX /></button>
  </div>;
}


export function MemberPostForm({ member,post }: { member: MemberSession;post?:MemberPost }) {
  const original=countries.flatMap(country=>country.regions.flatMap(region=>region.cities.map(city=>({country,region,city})))).find(item=>item.city.href===post?.cityHref);
  const [countryCode, setCountry] = useState(original?.country.code||'');
  const [regionHref, setRegion] = useState(original?.region.href||'');
  const [cityHref, setCity] = useState(original?.city.href||'');
  const [groupName, setGroup] = useState(serviceGroups.find(group=>group.services.some(service=>service.slug===post?.service))?.name||'');
  const [serviceSlug, setService] = useState(post?.service||'');
  const [description, setDescription] = useState(post?.description||'');
  const [saved,setSaved]=useState((post?.images||[]).map((src,index)=>({src,id:post?.mediaIds?.[index]})));
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const uploads = usePictureUploads();
  const pictures = uploads.items;
  const [processing, setProcessing] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitStep | null>(null);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const country = countries.find((item) => item.code === countryCode);
  const region = country?.regions.find((item) => item.href === regionHref);
  const city = region?.cities.find((item) => item.href === cityHref);
  const group = serviceGroups.find((item) => item.name === groupName);
  const service = group?.services.find((item) => item.slug === serviceSlug);

  function addPictures(files: File[]) {
    if (fileInput.current) fileInput.current.value = '';
    if (!files.length) return;
    setPhotoError('');
    if (saved.length + pictures.length + files.length > 6) { setPhotoError('You can add up to 6 pictures.'); return; }
    const invalid = files.map(validatePicture).find(Boolean);
    if (invalid) { setPhotoError(invalid); return; }
    uploads.add(files);
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
    const contactEmail = String(data.get('contactEmail')||'').trim();
    const age = Number(data.get('age'));
    if (!title || !location || description.trim().length < 30 || description.length > 2950 || !Number.isInteger(age) || age < 18 || age > 120) {
      setError('Complete all required fields. Use an age of 18 or over and a description between 30 and 2950 characters.'); return;
    }
    setProcessing(true);
    try {
      // Pictures leave the phone only now; the server converts them to WebP.
      const mediaIds = pictures.length ? await uploads.uploadAll((done, total, percent) => setSubmitState({ step: 0, title: `Uploading pictures ${Math.min(done + 1, total)}/${total} · ${percent}%`, detail: '' })) : [];
      setSubmitState({ step: 1, title: 'Saving…', detail: '' });
      const response = await fetch('/api/account/ads'+(post?'/'+post.id:''), { method: post?'PATCH':'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, description: description.trim(), categorySlug: service.slug, age, location, phone, contactEmail, ...(post?{keepMediaIds:saved.flatMap(photo=>photo.id?[photo.id]:[])}:{cityHref:city.href}), mediaIds }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not submit your ad.');
      setSubmitState({ step: 2, title: 'Submitted', detail: '' });
      window.dispatchEvent(new Event('bpn-session-change'));
      toast.success(post?'Changes submitted for review.':'Ad submitted for review.');
      goTo(post?'/myaccount/posts/'+post.id:'/myaccount', true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit your ad.'); setSubmitState(null); setProcessing(false); }
  }

  return <div className={styles.formWidth}>
    <h1>{post?'Edit ad':'Post an Ad'}</h1><p className={styles.intro}>{post?'Update your details and pictures. Existing city placements are kept.':'Choose where your ad appears, then add the details. Required fields are marked *.'}</p>
    <form className={styles.form} onSubmit={publish}>
      <section className={styles.section} aria-labelledby="post-location-heading">
        <h2 id="post-location-heading"><FiMapPin aria-hidden="true" /> Location & category</h2>
        <div className={styles.fields}>
          <SiteSelect label="Country" disabled={Boolean(post)} required value={countryCode} options={countries.map((item) => ({ value: item.code, label: item.name }))} placeholder="Choose your country" onChange={(value) => { setCountry(value); setRegion(''); setCity(''); }} />
          <SiteSelect label="State or region" required value={regionHref} disabled={Boolean(post)||!country} placeholder={country ? 'Choose your state or region' : 'Select a country first'} options={country?.regions.map((item) => ({ value: item.href, label: item.name })) ?? []} onChange={(value) => { setRegion(value); setCity(''); }} />
          <SiteSelect label="City" required value={cityHref} disabled={Boolean(post)||!region} placeholder={region ? 'Pick your city' : 'Select a state or region first'} options={region?.cities.map((item) => ({ value: item.href, label: item.name })) ?? []} onChange={setCity} />
          <SiteSelect label="Category" required value={groupName} placeholder="Choose your category" options={serviceGroups.map((item) => ({ value: item.name, label: item.name, strong: item.name === 'Dating' || item.name === 'Adult' }))} onChange={(value) => { setGroup(value); setService(''); }} />
          <SiteSelect label="Subcategory" required value={serviceSlug} disabled={!group} placeholder={group ? 'Choose your subcategory' : 'Select a category first'} options={group?.services.map((item) => ({ value: item.slug, label: item.name, strong: item.slug === 'women-seeking-men' })) ?? []} onChange={setService} />
        </div>
      </section>
      <aside className={styles.rules}>
        <h2>Please read before posting</h2>
        <ul><li><strong>Choose the right category.</strong> Keep your ad accurate and relevant.</li><li><strong>Be respectful.</strong> Avoid explicit language, harassment and misleading claims.</li><li><strong>Have permission.</strong> Only upload pictures you own or are allowed to use.</li><li><strong>Follow the law.</strong> No illegal content or services. Read our <Link href="/guidelines">Guidelines</Link>.</li></ul>
      </aside>
      <section className={styles.section} aria-labelledby="post-info-heading">
        <h2 id="post-info-heading"><FiInfo aria-hidden="true" /> Must-have info</h2>
        <div className={styles.fields}>
          <label className={styles.full}>Headline *<input name="headline" defaultValue={post?.title} required maxLength={140} placeholder="Give your ad a clear, descriptive title" /></label>
          <label>Age *<input name="age" defaultValue={post?.age} type="number" required min={18} max={120} step={1} inputMode="numeric" placeholder="Your age (18+)" /></label>
          <label>Location *<input name="location" defaultValue={post?.location} required maxLength={120} placeholder="Neighborhood or nearby area" /></label>
          <label>Phone number<input name="phone" defaultValue={post?.phone} type="tel" maxLength={40} autoComplete="tel" placeholder="e.g. +1 202 555 0142" /></label>
          <label>Contact email<input name="contactEmail" defaultValue={post?.contactEmail} type="email" maxLength={254} placeholder="Public contact email (optional)" /><small>This address will be visible on your ad.</small></label>
          <div className={styles.full}><p className={styles.editorLabel}>Description *</p><DescriptionEditor content={post?.descriptionHtml||post?.description||''} onChange={(text, html) => { setDescription(text); setDescriptionHtml(html); }} /></div>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="post-pictures-heading">
        <h2 id="post-pictures-heading"><FiImage aria-hidden="true" /> Your pictures <span className={styles.help}>{saved.length+pictures.length} / 6</span></h2>
        <div className={styles.upload} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addPictures(Array.from(event.dataTransfer.files)); }}>
          <FiUploadCloud aria-hidden="true" /><strong>Add pictures to your ad</strong><p>Drop images here or choose files. JPG, PNG, WebP or AVIF, up to 15 MB each. Pictures are sent when you submit your ad.</p>
          <button className={styles.secondary} type="button" disabled={processing || saved.length+pictures.length >= 6} onClick={() => fileInput.current?.click()}>Choose pictures</button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden aria-label="Upload ad pictures" onChange={(event) => addPictures(Array.from(event.target.files ?? []))} />
        </div>
        {(saved.length+pictures.length)>0&&<div className={styles.photos}>{saved.map((photo,index)=><div key={photo.src}><Image src={photo.src} alt={'Saved ad picture '+(index+1)} width={200} height={160} unoptimized/>{index===0&&<span>Cover photo</span>}<button type="button" disabled={processing} aria-label={'Remove saved picture '+(index+1)} onClick={()=>setSaved(previous=>previous.filter((_,item)=>item!==index))}><FiX/></button></div>)}{pictures.map((picture, index) => <UploadTile key={picture.key} item={picture} index={index} cover={index === 0 && !saved.length} disabled={processing} onRemove={() => uploads.remove(picture.key)} onRetry={() => uploads.retry(picture.key)} />)}</div>}
        <p className={styles.help}>Pictures are uploaded when you submit, then optimized on our servers.</p>
        <FeedbackToast message={photoError} />
      </section>
      <section className={styles.section} aria-labelledby="post-privacy-heading">
        <h2 id="post-privacy-heading"><FiShield aria-hidden="true" /> Privacy & legal</h2>
        <label className={styles.check}><input type="checkbox" required /><span>I am 18 or older. I have permission to publish this content and agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</span></label>
        <p className={styles.notice}>Your listing is sent for review. Pictures are optimized securely after upload and only approved ads appear publicly.</p>
      </section>
      <FeedbackToast message={error} />
      <div className={styles.publish}><Link href={post?'/myaccount/posts/'+post.id:'/myaccount'}>Cancel</Link><button className={styles.primary} type="submit" disabled={processing}>{processing ? <><span className={styles.buttonSpinner} aria-hidden="true" /><span aria-live="polite">{submitState?.title ?? 'Saving…'}</span></> : post?'Save changes for review':'Submit ad for review'}</button></div>
    </form>
  </div>;
}
