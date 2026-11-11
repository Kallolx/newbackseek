'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSamplePosts } from '../directory/sample-posts';

type Props = {
  city: { name: string; href: string };
  region: { name: string; href: string };
  service: { name: string; slug: string };
  postId: string;
};

const photos = ['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4', 'Photo 5'];
const postedTime = new Intl.RelativeTimeFormat('en-US');

function formatPostedTime(timestamp: string) {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 3_600_000));
  return postedTime.format(-hours, 'hour');
}

export function PostDetail({ city, region, service, postId }: Props) {
  const [favorite, setFavorite] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [shared, setShared] = useState(false);
  const posts = getSamplePosts(city.name, service.name);
  const post = posts.find(({ id }) => id === postId);
  if (!post) return null;
  const { title } = post;
  const titleWords = title.split(' ');
  const breadcrumbTitle = titleWords.length > 3 ? titleWords.slice(0, 3).join(' ') + '…' : title;

  return (
    <main id="main" className="shell browse-page post-detail">
      <nav className="browse-crumbs" aria-label="Breadcrumb">
        <Link href={city.href}>{city.name}</Link><span aria-hidden="true"> › </span>
        <Link href={city.href + '/' + service.slug}>{service.name}</Link><span aria-hidden="true"> › </span>
        <strong aria-current="page" aria-label={title} title={title}>{breadcrumbTitle}</strong>
      </nav>
      <h1>{title}</h1>
      <div className="post-meta">
        <p>Posted: <time dateTime={post.postedAt} suppressHydrationWarning>{formatPostedTime(post.postedAt)}</time></p>
        <button className="favorite-button" type="button" aria-pressed={favorite} onClick={() => setFavorite(!favorite)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
            <path d="M12 20.5 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6a4.8 4.8 0 0 1 6.8 6.8Z" />
          </svg>
          {favorite ? 'Saved to Favorites' : 'Save to Favorites'}
        </button>
      </div>
      <div className="post-gallery-viewer">
        <button type="button" aria-label="Previous photo" onClick={() => setPhoto((photo + photos.length - 1) % photos.length)}>‹</button>
        <div className="post-main-photo">
          <div className="post-photo-placeholder">
            {photos[photo]}
          </div>
          <small>{photo + 1} / {photos.length}</small>
        </div>
        <button type="button" aria-label="Next photo" onClick={() => setPhoto((photo + 1) % photos.length)}>›</button>
      </div>
      <div className="post-thumbnails">
        {photos.map((label, index) => (
          <button key={label} type="button" aria-label={label} aria-pressed={photo === index} onClick={() => setPhoto(index)} />
        ))}
      </div>
      <dl className="post-facts">
        <div><dt>Age</dt><dd>{post.age}</dd></div>
        <div><dt>Location</dt><dd>{city.name}, {region.name}</dd></div>
        <div><dt>Orientation</dt><dd>Not specified</dd></div>
        <div><dt>Looking for</dt><dd>{service.name}</dd></div>
      </dl>
      <section className="post-description">
        <h2>About this post</h2>
        <p>{post.description}</p>
        <p>I’m based in {city.name} and usually available on weekday evenings or Saturday afternoons. A quick introduction is a great way to start.</p>
        <p>When you reach out, tell me a little about yourself and include a day and time that works for you.</p>
        <h2>Sample contact details</h2>
        <p>Email: <a href="mailto:hello@example.com">hello@example.com</a><br />
          Phone: <a href="tel:+12025550142">+1 (202) 555-0142</a></p>
      </section>
      <div className="post-actions">
        <span>[AD ID: {postId.replace('post-', '')}]</span>
        <button type="button" onClick={async () => {
          if (navigator.share) await navigator.share({ title, url: window.location.href });
          else { await navigator.clipboard.writeText(window.location.href); setShared(true); }
        }}>{shared ? '[Link copied]' : '[Share]'}</button>
        <button className="report-ad" type="button" onClick={() => window.alert('Report submission will be available when reporting is connected.')}>[Report this ad]</button>
      </div>
      <section className="recent-posts">
        <h2>Recent Ads by Other Users</h2>
        {posts.filter(({ id }) => id !== postId).slice(0, 8).map(({ id, title, age }) => (
          <article key={id}>
            <div className="recent-post-thumbnail" aria-hidden="true" />
            <div>
              <Link className="recent-post-title" href={city.href + '/' + service.slug + '/' + id}>{title}</Link>
              <small>{age}yo · {city.name}</small>
            </div>
          </article>
        ))}
        <Link href={city.href + '/' + service.slug}>More ads around {city.name} ›</Link>
      </section>
    </main>
  );
}
