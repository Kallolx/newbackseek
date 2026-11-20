'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteFooter() {
  const home = usePathname() === '/';
  return (
    <footer className="footer"><div className="shell footer-inner">
      <nav className="footer-primary" aria-label="Footer navigation">
        <Link href="/about" prefetch={false}>About</Link><Link href="/blog" prefetch={false}>Blog</Link><Link href="/contact" prefetch={false}>Contact</Link>
        <Link href="/guidelines" prefetch={false}>Guidelines</Link><Link href="/privacy" prefetch={false}>Privacy</Link>
        <Link href="/terms" prefetch={false}>Terms</Link><Link href="/refund-policy" prefetch={false}>Refund Policy</Link>
      </nav>
      {home && <nav className="footer-secondary" aria-label="Directory topics">
        <Link href="/backpage-alternative" prefetch={false}>Backpage Alternative</Link><Link href="/personals" prefetch={false}>Local Personals</Link>
        <Link href="/dating" prefetch={false}>Dating</Link><Link href="/classifieds" prefetch={false}>Free Classifieds</Link>
      </nav>}
      <p><a href="https://x.com/BackpageNew" target="_blank" rel="me noopener noreferrer" aria-label="BackpageNew on X (Twitter)">Follow us on X</a></p>
      <p>© 2026 BackpageNew.com</p>
      <a className="back-to-top" href="#top">↑ Top</a>
    </div></footer>
  );
}
