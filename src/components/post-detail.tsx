'use client';

import { FeedbackToast } from './toast';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, PageLoader } from './page-state';
import { PhotoGallery } from './photo-gallery';

type Place = { name: string; href: string };
type Post = { id: string; title: string; description: string; age: number; location: string; phone: string; contact_email?:string; created_at: string; category_slug: string };
type Photo = { id: string; variants: { full?: { url: string }; card?: { url: string }; thumb?: { url:string } } };

export function PostDetail({ city, region, service, postId }: { city: Place; region: Place; service: { name: string; slug: string }; postId: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [recent, setRecent] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/ads/${postId}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? 'This ad is no longer available.' : 'Unable to load this ad.');
      const data = await response.json();
      if (data.post.category_slug !== service.slug || !data.cities.some((place: Place) => place.href === city.href)) throw new Error('This ad is not available in this category or city.');
      setPost(data.post); setPhotos(data.images);
      const feed = await fetch(`/api/ads?cityHref=${encodeURIComponent(city.href)}&category=${encodeURIComponent(service.slug)}`, { signal: controller.signal, cache: 'no-store' });
      if (feed.ok) setRecent((await feed.json()).posts.filter((item: Post) => String(item.id) !== postId).slice(0, 8));
    }).catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [postId, city.href, service.slug]);
  if (loading) return <main id="main" className="shell browse-page"><PageLoader label="Loading ad"/></main>;
  if (!post || error) return <main id="main" className="shell browse-page"><EmptyState title="Ad unavailable" description={error || 'This ad is no longer available.'} href={city.href + '/' + service.slug} action="Browse ads" /></main>;
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(post.created_at)) / 3600000));
  return <main id="main" className="shell browse-page post-detail">
    <nav className="browse-crumbs"><Link href={city.href}>{city.name}</Link> › <Link href={city.href + '/' + service.slug}>{service.name}</Link></nav>
    <h1>{post.title}</h1><p>Posted: {hours === 1 ? '1 hour ago' : `${hours} hours ago`}</p>
    <PhotoGallery title={post.title} photos={photos.filter(photo=>photo.variants.full?.url||photo.variants.card?.url).map(photo=>({src:(photo.variants.full?.url||photo.variants.card?.url)!,thumbnail:photo.variants.thumb?.url||photo.variants.card?.url}))} />
    <dl className="post-facts"><div><dt>Age</dt><dd>{post.age}</dd></div><div><dt>Location</dt><dd>{post.location || `${city.name}, ${region.name}`}</dd></div><div><dt>Phone</dt><dd>{post.phone?<a href={`tel:${post.phone.replace(/[^+\d]/g,'')}`}>{post.phone}</a>:'Not provided'}</dd></div><div><dt>Contact email</dt><dd>{post.contact_email?<a href={`mailto:${post.contact_email}`}>{post.contact_email}</a>:'Not provided'}</dd></div></dl>
    <section className="post-description"><h2>About this post</h2><p style={{ whiteSpace: 'pre-wrap' }}>{post.description}</p>{post.phone && <p>Phone: <a href={`tel:${post.phone}`}>{post.phone}</a></p>}</section>
    <div className="post-actions"><span>[AD ID: {postId}]</span><button type="button" onClick={async () => { try { if (navigator.share) await navigator.share({ title: post.title, url: window.location.href }); else { await navigator.clipboard.writeText(window.location.href); setMessage('Link copied.'); } } catch {} }}>Share</button><button type="button" onClick={async () => { const reason = window.prompt('Why are you reporting this ad?'); if (!reason) return; const response = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adId: Number(postId), reason }) }); setMessage(response.ok ? 'Report submitted.' : 'Please sign in to report this ad.'); }}>Report this ad</button></div><FeedbackToast message={message} type="info" />
    {recent.length > 0 && <section className="recent-posts"><h2>Recent Ads by Other Users</h2>{recent.map(item => <article key={item.id}><Link href={`${city.href}/${service.slug}/${item.id}`}>{item.title}</Link></article>)}</section>}
  </main>;
}
