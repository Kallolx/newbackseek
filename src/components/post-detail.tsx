'use client';

import { FeedbackToast } from './toast';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FiArrowLeft, FiHeart } from 'react-icons/fi';
import { EmptyState } from './page-state';
import { DetailSkeleton } from './skeletons';
import { PhotoGallery } from './photo-gallery';
import { AdActions } from '../member/ad-actions';

type Place = { name: string; href: string };
type Variants = { full?: { url: string }; card?: { url: string }; thumb?: { url: string } };
type Post = { id: string; title: string; description: string; age: number; location: string; phone: string; contact_email?: string; status?: string; created_at: string; category_slug: string; image?: Variants | null };
type Photo = { id: string; variants: Variants };
type RecentPost = { id: string; title: string; age: number; image?: Variants | null };

const FAVORITES_KEY = 'bpn-favorites';
function readFavorites(): string[] { try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } }
const favoritesEvent = 'bpn-favorites';
function subscribeFavorites(listener: () => void) { window.addEventListener(favoritesEvent, listener); window.addEventListener('storage', listener); return () => { window.removeEventListener(favoritesEvent, listener); window.removeEventListener('storage', listener); }; }

type Initial = { post: Post; images: Photo[]; recent: RecentPost[] } | { missing: true };

export function PostDetail({ city, region, service, postId, account = false, initial }: { city: Place; region?: Place; service: { name: string; slug: string }; postId: string; account?: boolean; initial?: Initial }) {
  const ready = initial && 'post' in initial ? initial : null;
  const [post, setPost] = useState<Post | null>(ready?.post ?? null);
  const [photos, setPhotos] = useState<Photo[]>(ready?.images ?? []);
  const [recent, setRecent] = useState<RecentPost[]>(ready?.recent ?? []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState(initial && 'missing' in initial ? 'This ad is no longer available.' : '');
  // Rendered by the server with its data: skip the first browser fetch.
  const usedInitial = useRef(Boolean(initial));
  const favorite = useSyncExternalStore(subscribeFavorites, () => readFavorites().includes(postId), () => false);
  const [message, setMessage] = useState('');
  const [shared, setShared] = useState(false);
  const [revision, setRevision] = useState(0);
  const Container = account ? 'section' : 'main';
  useEffect(() => {
    if (usedInitial.current) { usedInitial.current = false; return; }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/${account ? 'account/ads' : 'ads'}/${postId}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? 'This ad is no longer available.' : 'Unable to load this ad.');
      const data = await response.json();
      if (!account && (data.post.category_slug !== service.slug || !data.cities.some((place: Place) => place.href === city.href))) throw new Error('This ad is not available in this category or city.');
      setPost(data.post); setPhotos(data.images);
      const feed = await fetch(`/api/ads?cityHref=${encodeURIComponent(city.href)}&category=${encodeURIComponent(service.slug)}`, { signal: controller.signal, cache: 'no-store' });
      if (feed.ok) setRecent((await feed.json()).posts.filter((item: RecentPost) => String(item.id) !== postId).slice(0, 8));
    }).catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [postId, city.href, service.slug, account, revision]);
  if (loading) return <Container className={account ? 'post-detail' : 'shell browse-page post-detail'}><DetailSkeleton crumbs={!account} /></Container>;
  if (!post || error) return <Container className={account ? '' : 'shell browse-page'}><EmptyState title="Ad unavailable" description={error || 'This ad is no longer available.'} href={account ? '/myaccount' : city.href + '/' + service.slug} action={account ? 'My ads' : 'Browse ads'} /></Container>;
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(post.created_at)) / 3600000));
  function toggleFavorite() {
    const next = !favorite;
    const list = readFavorites().filter(id => id !== postId);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next ? [...list, postId] : list)); } catch {}
    window.dispatchEvent(new Event(favoritesEvent));
  }
  return <Container id={account ? undefined : 'main'} className={account ? 'post-detail' : 'shell browse-page post-detail'}>
    {account
      ? <Link className="post-back-link" href="/myaccount"><FiArrowLeft aria-hidden="true" /> My ads</Link>
      : <nav className="browse-crumbs" aria-label="Breadcrumb"><Link href={city.href}>{city.name}</Link> › <Link href={city.href + '/' + service.slug}>{service.name}</Link></nav>}
    <div className="post-title-row">
      <h1>{post.title}</h1>
      {account && <AdActions id={postId} status={post.status || 'pending'} onChange={() => setRevision(value => value + 1)} />}
    </div>
    <div className="post-meta">
      <p suppressHydrationWarning>Posted: {hours === 1 ? '1 hour ago' : `${hours} hours ago`}</p>
      {!account && <button className="favorite-button" type="button" aria-pressed={favorite} onClick={toggleFavorite}><FiHeart aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'Saved to Favorites' : 'Save to Favorites'}</button>}
    </div>
    <PhotoGallery title={post.title} photos={photos.filter(photo => photo.variants.full?.url || photo.variants.card?.url).map(photo => ({ src: (photo.variants.full?.url || photo.variants.card?.url)!, thumbnail: photo.variants.thumb?.url || photo.variants.card?.url }))} />
    <dl className="post-facts"><div><dt>Age</dt><dd>{post.age}</dd></div><div><dt>Location</dt><dd>{post.location || (region && region.name !== city.name ? `${city.name}, ${region.name}` : city.name)}</dd></div><div><dt>Phone</dt><dd>{post.phone ? <a href={`tel:${post.phone.replace(/[^+\d]/g, '')}`}>{post.phone}</a> : 'Not provided'}</dd></div><div><dt>Contact email</dt><dd>{post.contact_email ? <a href={`mailto:${post.contact_email}`}>{post.contact_email}</a> : 'Not provided'}</dd></div></dl>
    <section className="post-description"><h2>About this post</h2><p style={{ whiteSpace: 'pre-wrap' }}>{post.description}</p>{post.phone && <p>Phone: <a href={`tel:${post.phone}`}>{post.phone}</a></p>}</section>
    <div className="post-actions">
      <span>[AD ID: {postId}]</span>
      <button type="button" onClick={async () => { try { if (navigator.share) await navigator.share({ title: post.title, url: window.location.href }); else { await navigator.clipboard.writeText(window.location.href); setShared(true); setMessage('Link copied.'); } } catch {} }}>{shared ? '[Link copied]' : '[Share]'}</button>
      {!account && <button className="report-ad" type="button" onClick={async () => { const reason = window.prompt('Why are you reporting this ad?'); if (!reason) return; const response = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adId: Number(postId), reason }) }); setMessage(response.ok ? 'Report submitted.' : 'Please sign in to report this ad.'); }}>[Report this ad]</button>}
    </div>
    <FeedbackToast message={message} type="info" />
    {recent.length > 0 && <section className="recent-posts">
      <h2>Recent Ads by Other Users</h2>
      {recent.map(item => {
        const thumb = item.image?.thumb?.url || item.image?.card?.url;
        const href = `${city.href}/${service.slug}/${item.id}`;
        return <article key={item.id}>
          <Link className="recent-post-thumbnail" href={href} prefetch={false} tabIndex={-1} aria-hidden="true">{thumb && <img src={thumb} alt="" width={44} height={44} loading="lazy" decoding="async" />}</Link>
          <div><Link className="recent-post-title" href={href} prefetch={false}>{item.title}</Link><small>{item.age}yo · {city.name}</small></div>
        </article>;
      })}
      <Link href={city.href + '/' + service.slug}>More ads around {city.name} ›</Link>
    </section>}
  </Container>;
}
