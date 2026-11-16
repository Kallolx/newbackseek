'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logOut, useMember } from '../member/session';

export function MemberNavigation() {
  const { member } = useMember();
  const router = useRouter();
  return (
    <nav className="header-member-nav" aria-label="Main navigation">
      {member ? <>
        <Link href="/myaccount/post">Post an Ad</Link>
        <Link href="/myaccount">My account</Link>
        <button type="button" onClick={async () => { await logOut(); router.replace('/auth'); router.refresh(); }}>Logout</button>
      </> : <Link href="/post">Post an Ad</Link>}
    </nav>
  );
}
