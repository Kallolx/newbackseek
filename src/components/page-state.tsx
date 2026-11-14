import Link from 'next/link';
import { FiFileText, FiSearch, FiImage } from 'react-icons/fi';
import type { ReactNode } from 'react';
import styles from './page-state.module.css';

export function EmptyState({ title, description, kind = 'posts', href, action, onAction, compact = false }: {
  title: string; description: string; kind?: 'posts' | 'search' | 'photo'; href?: string; action?: string; onAction?: () => void; compact?: boolean;
}) {
  const Icon = kind === 'search' ? FiSearch : kind === 'photo' ? FiImage : FiFileText;
  return <div className={styles.empty} data-compact={compact || undefined}>
    <div className={styles.art} aria-hidden="true"><span /><Icon /><span /></div>
    <h2>{title}</h2><p>{description}</p>
    {action && (href ? <Link className={styles.action} href={href}>{action}</Link> : <button type="button" className={styles.action} onClick={onAction}>{action}</button>)}
  </div>;
}

export function PageLoader({ label = 'Loading your account', children }: { label?: string; children?: ReactNode }) {
  return <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
    <div className={styles.loaderHeading}><span className={styles.spinner} aria-hidden="true" /><span>{label}…</span></div>
    <div className={styles.skeleton} aria-hidden="true"><i /><i /><div /><div /><div /></div>
    {children}
  </div>;
}
