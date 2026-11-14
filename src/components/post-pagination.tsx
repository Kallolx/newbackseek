'use client';

export function PostPagination({ page, total, onChange }: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total < 1) return null;
  return (
    <nav className="pagination" aria-label="Post pages">
      <button type="button" disabled={page === 1} aria-label="Previous page" onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: total }, (_, index) => index + 1).map((number) => (
        <button key={number} type="button" aria-current={number === page ? 'page' : undefined} onClick={() => onChange(number)}>{number}</button>
      ))}
      <button type="button" disabled={page === total} aria-label="Next page" onClick={() => onChange(page + 1)}>›</button>
    </nav>
  );
}
