'use client';

import Link from 'next/link';
import { toast } from './toast';
import { logOut, useMember } from '../member/session';

// Both link sets are always in the page. Which one shows is decided by html[data-member] (set before the
// first paint from what this browser remembers), so the header never flips from "Post an Ad" to "My account".
export function MemberNavigation() {
  useMember(); // keeps the remembered state in step with the real session
  return (
    <nav className="header-member-nav" aria-label="Main navigation">
      <span className="nav-out"><Link href="/post" prefetch={false}>Post an Ad</Link></span>
      <span className="nav-in">
        <Link href="/myaccount">My account</Link>
        <button type="button" onClick={async () => { try { await logOut(); window.location.replace('/auth'); } catch(error) {toast.error((error as Error).message);} }}>Logout</button>
      </span>
    </nav>
  );
}
