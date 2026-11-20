'use client';

import Link from 'next/link';
import { useState } from 'react';

type Place = { name: string; context: string; href: string };

export function LocationSearch({ places }: { places: Place[] }) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const matches = term ? places.filter(({ name, context }) =>
    (name + ' ' + context).toLowerCase().includes(term)).slice(0, 8) : [];

  return <div className="search" role="search" aria-label="Find a location">
    <label className="sr-only" htmlFor="location">Find a location</label>
    <div className="search-field">
      <input id="location" type="search" placeholder="Search for a city or location..." autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <span className="sr-only" role="status">{term ? matches.length + ' results shown' : ''}</span>
    {term && <div className="results">
      {matches.length ? <ul>{matches.map((place) => <li key={place.href}><Link href={place.href} prefetch={false}>
        <strong>{place.name}</strong><small>{place.context}</small>
      </Link></li>)}</ul> : <p>No matching locations.</p>}
    </div>}
  </div>;
}

