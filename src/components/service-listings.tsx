'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from './page-state';
import { ListingSkeleton } from './skeletons';
import { FeedbackToast } from './toast';
import { PostCard } from './post-card';
import { PostPagination } from './post-pagination';

type Service = { name: string; slug: string };
type Post = { id: string; title: string; description: string; age: number; image?: { card?: { url: string } } | null };
type Props = {
  city: { name: string; href: string };
  service: Service;
  groups: { name: string; services: Service[] }[];
  dating: boolean;
  /** First page, rendered on the server so the list appears with the page. */
  initial?: { posts: Post[]; hasMore: boolean };
};

export function ServiceListings({ city, service, groups, dating, initial }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const [accepted, setAccepted] = useState(false);
  const [ageReady, setAgeReady] = useState(false);
  const [posts, setPosts] = useState<Post[]>(initial?.posts ?? []);
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false);
  const [loading, setLoading] = useState(!initial);
  const usedInitial = useRef(Boolean(initial));
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const locked = dating && !accepted;

  useEffect(() => {
    try { setAccepted(sessionStorage.getItem('bpn-adult-confirmed') === 'yes'); } catch {}
    setAgeReady(true);
  }, []);

  useEffect(() => {
    // The server already rendered page 1; only fetch when the visitor changes page or searches.
    if (usedInitial.current) { usedInitial.current = false; return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/ads?cityHref=${encodeURIComponent(city.href)}&category=${encodeURIComponent(service.slug)}&search=${encodeURIComponent(search)}&page=${page}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('Unable to load listings. Please try again.'); return response.json(); })
      .then(data => { setPosts(data.posts); setHasMore(data.hasMore); })
      .catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [city.href, service.slug, search, page]);

  useEffect(() => {
    if (ageReady && locked) dialog.current?.showModal();
  }, [locked, ageReady]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!dropdown.current?.contains(event.target as Node)) setDropdownOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setDropdownOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const pageCount = page + (hasMore ? 1 : 0);

  return (
    <>
      <h1 className="sr-only">{service.name} in {city.name}</h1>
      {ageReady && locked && (
        <dialog ref={dialog} className="dating-warning" aria-labelledby="dating-warning-title"
          onCancel={(event) => { event.preventDefault(); router.push(city.href); }}>
          <h2 id="dating-warning-title">Adults 18+ only</h2>
          <p>These listings may contain mature content. Continue only if you are 18 or older.</p>
          <p className="dating-notice">Illegal activity is prohibited.</p>
          <button type="button" onClick={() => { try { sessionStorage.setItem('bpn-adult-confirmed', 'yes'); } catch {} document.documentElement.dataset.adult = 'yes'; dialog.current?.close(); setAccepted(true); }}>
            I am 18 or older
          </button>
          <Link href={city.href}>Exit to categories</Link>
        </dialog>
      )}
      {/* Adult listings are in the page but stay hidden (CSS) until the visitor has confirmed 18+.
          A tiny script in <head> marks returning visitors before the first paint. */}
      {!(ageReady && locked) && (
        <section className={dating ? 'listings adult-gated' : 'listings'} aria-label="Posts">
          <div className="listing-tools">
            <div className="service-dropdown" ref={dropdown}>
              <button
                type="button"
                className="service-dropdown-trigger"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((open) => !open)}
              >
                <span>{service.name}</span>
                <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg>
              </button>
              {dropdownOpen && (
                <div className="service-dropdown-menu" role="listbox" aria-label="Service category">
                  {groups.map((group) => (
                    <section key={group.name}>
                      <h2>{group.name}</h2>
                      {group.services.map((item) => (
                        <button
                          key={item.slug}
                          type="button"
                          role="option"
                          aria-selected={item.slug === service.slug}
                          onClick={() => {
                            setDropdownOpen(false);
                            router.push(city.href + '/' + item.slug);
                          }}
                        >
                          {item.slug === 'women-seeking-men' ? <strong>{item.name}</strong> : item.name}
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </div>
            <div className="listing-views" role="group" aria-label="Post layout">
              <button type="button" aria-pressed={!gallery} onClick={() => setGallery(false)}>List</button>
              <button type="button" aria-pressed={gallery} onClick={() => setGallery(true)}>Gallery</button>
            </div>
          </div>
          <form className="listing-search" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
            <input type="search" aria-label="Search posts" placeholder="Search title or keyword…" value={query}
              onChange={(event) => { setQuery(event.target.value); if (!event.target.value) { setSearch(''); setPage(1); } }} />
            <button type="submit">Search</button>
          </form>
          {loading ? <ListingSkeleton gallery={gallery} /> : error ? <><FeedbackToast message={error} /><EmptyState title="Listings could not load" description="Please refresh to try again." /></> : posts.length ? (
            <ul className={gallery ? 'post-list post-gallery' : 'post-list'}>
              {posts.map((post, index) => (
                <PostCard key={post.id} title={post.title} label={city.name} description={post.description}
                  thumbnail={post.image?.card?.url ? <img src={post.image.card.url} alt="" width={480} height={320} loading={index < 4 ? 'eager' : 'lazy'} fetchPriority={index < 2 ? 'high' : 'auto'} decoding="async" /> : undefined}
                  details={'Age: ' + post.age} href={city.href + '/' + service.slug + '/' + post.id} />
              ))}
            </ul>
          ) : <EmptyState title={search ? 'No matching ads' : 'No ads here yet'} description={search ? 'Try another keyword.' : 'Published ads in this city and category will appear here.'} />}
          {!loading && (posts.length > 0 || page > 1) && <PostPagination page={page} total={pageCount} onChange={(value) => { setPage(value); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
        </section>
      )}
    </>
  );
}
