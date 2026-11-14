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
        <Link href="/myaccount">My account</Link>
        <button type="button" onClick={() => { logOut(); router.replace('/auth'); }}>Logout</button>
      </> : <Link href="/post">Post an Ad</Link>}
    </nav>
  );
}
