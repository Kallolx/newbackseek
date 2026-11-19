import Link from 'next/link';

/** Text written by the admin for a page (plain text; blank lines start a new paragraph). */
export function AdminIntro({ text }: { text?: string | null }) {
  const paragraphs = (text || '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (!paragraphs.length) return null;
  return <div className="seo-text">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
}

export function FaqList({ items, title = 'Frequently asked questions' }: { items: { q: string; a: string }[]; title?: string }) {
  if (!items.length) return null;
  return <section className="seo-faq" aria-labelledby="faq-title"><h2 id="faq-title">{title}</h2>
    <dl>{items.map((item) => <div key={item.q}><dt>{item.q}</dt><dd>{item.a}</dd></div>)}</dl>
  </section>;
}

export function PlaceLinks({ title, places, more }: { title: string; places: { name: string; href: string; note?: string }[]; more?: { href: string; label: string } }) {
  if (!places.length) return null;
  return <section className="seo-places" aria-label={title}><h2>{title}</h2>
    <ul>{places.map((place) => <li key={place.href}><Link href={place.href} prefetch={false}>{place.name}</Link>{place.note && <span> · {place.note}</span>}</li>)}</ul>
    {more && <Link className="seo-more" href={more.href} prefetch={false}>{more.label} →</Link>}
  </section>;
}
