import Link from 'next/link';
import type { ReactNode } from 'react';
import { MdVerified } from 'react-icons/md';

export function PostCard({ title, label, description, details, href, thumbnail, actions, verified = false }: {
  title: string;
  label: string;
  description: string;
  details: ReactNode;
  href?: string;
  thumbnail?: ReactNode;
  actions?: ReactNode;
  /** The poster passed verification: shows a badge above the picture. */
  verified?: boolean;
}) {
  const image = thumbnail ?? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m4 17 5-5 4 4 3-3 5 5" />
    </svg>
  );

  return (
    <li className={href ? 'post-card-clickable' : undefined}>
      {href && <Link className="post-card-hitbox" href={href} prefetch={false} aria-label={'View ' + title} />}
      <div className="post-media">
        {verified ? <span className="verified-badge" title="This poster has been verified"><MdVerified aria-hidden="true" /> Verified</span> : <span className="verified-space" aria-hidden="true" />}
        <div className="post-thumbnail">{image}</div>
      </div>
      <div className="post-copy">
        <div className="post-card-heading">
          <div>
            <p className="post-breadcrumb">{label}</p>
            <h2>{title}</h2>
          </div>
          {actions}
        </div>
        <p>{description}</p>
        <small>{details}</small>
      </div>
    </li>
  );
}
