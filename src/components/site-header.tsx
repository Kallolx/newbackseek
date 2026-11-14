import Link from 'next/link';
import Image from 'next/image';
import { HeaderQr } from './header-qr';
import { MemberNavigation } from './member-navigation';

export function SiteHeader() {
  return (
    <header className="header" id="top"><div className="shell bar">
      <Link className="brand" href="/" aria-label="BackpageNew home">
        <Image
          className="brand-wordmark"
          src="/brand/backpage-new-logo.png"
          alt="BackpageNew"
          width={2172}
          height={724}
          priority
        />
      </Link>
      <HeaderQr />
      <MemberNavigation />
    </div></header>
  );
}
