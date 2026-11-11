import Link from 'next/link';

export default function NotFound() {
  return <main id="main" className="shell missing">
    <span className="eyebrow">404 / PAGE UNAVAILABLE</span>
    <h1>This page is unavailable.</h1>
    <p>Head back to the homepage to explore the directory.</p>
    <Link className="button" href="/">Back to home</Link>
  </main>;
}

