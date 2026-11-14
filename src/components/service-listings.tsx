'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getSamplePosts } from '../directory/sample-posts';
import { PostCard } from './post-card';
import { PostPagination } from './post-pagination';

type Service = { name: string; slug: string };
type Props = {
  city: { name: string; href: string };
  service: Service;
  groups: { name: string; services: Service[] }[];
  dating: boolean;
};

export function ServiceListings({ city, service, groups, dating }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const [accepted, setAccepted] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const locked = dating && !accepted;

  useEffect(() => {
    if (locked) dialog.current?.showModal();
  }, [locked]);

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

  const examples = getSamplePosts(city.name, service.name);
  const matching = examples.filter(({ title, description }) =>
    (title + ' ' + description + ' ' + city.name).toLowerCase().includes(search.toLowerCase()),
  );
  const pageSize = 10;
  const pageCount = Math.ceil(matching.length / pageSize);
  const visiblePosts = matching.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <h1 className="sr-only">{service.name} in {city.name}</h1>
      {locked ? (
        <dialog ref={dialog} className="dating-warning" aria-labelledby="dating-warning-title"
          onCancel={(event) => { event.preventDefault(); router.push(city.href); }}>
          <h2 id="dating-warning-title">Adults 18+ only</h2>
          <p>These listings may contain mature content. Continue only if you are 18 or older.</p>
          <p className="dating-notice">Illegal activity is prohibited.</p>
          <button type="button" onClick={() => { dialog.current?.close(); setAccepted(true); }}>
            I am 18 or older
          </button>
          <Link href={city.href}>Exit to categories</Link>
        </dialog>
      ) : (
        <section className="listings" aria-label="Posts">
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
          <p className="listing-note">Sample posts</p>
          {matching.length ? (
            <ul className={gallery ? 'post-list post-gallery' : 'post-list'}>
              {visiblePosts.map((post) => (
                <PostCard key={post.id} title={post.title} label={post.breadcrumb} description={post.description}
                  details={'Age: ' + post.age} href={city.href + '/' + service.slug + '/' + post.id} />
              ))}
            </ul>
          ) : <p role="status">No posts match your search.</p>}
          {matching.length > 0 && <PostPagination page={page} total={pageCount} onChange={setPage} />}
        </section>
      )}
    </>
  );
}
