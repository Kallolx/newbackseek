'use client';

import Link from 'next/link';
import { toast } from './toast';
import { logOut, useMember } from '../member/session';

export function MemberNavigation() {
  const { member } = useMember();
  return (
    <nav className="header-member-nav" data-signed-in={Boolean(member)} aria-label="Main navigation">
      {member ? <>
        <Link href="/myaccount">My account</Link>
        <button type="button" onClick={async () => { try { await logOut(); window.location.replace('/auth'); } catch(error) {toast.error((error as Error).message);} }}>Logout</button>
      </> : <Link href="/post" prefetch={false}>Post an Ad</Link>}
    </nav>
  );
}
