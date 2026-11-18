import type { ReactNode } from 'react';

export function LegalPage({ title, summary, children, date = 'November 17, 2026' }: { title: string; summary: string; children: ReactNode; date?: string }) {
  return <main id="main" className="legal-page"><article className="legal-content">
    <p className="legal-kicker">BackpageNew</p>
    <h1>{title}</h1>
    <p className="legal-summary">{summary}</p>
    <p className="legal-date">Effective date: {date}</p>
    <div className="legal-copy">{children}</div>
  </article></main>;
}
