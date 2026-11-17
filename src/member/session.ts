'use client';

import { useCallback, useEffect, useState } from 'react';

export type MemberPost = {
  id: string; title: string; description: string; descriptionHtml?: string; age: number; location: string; phone: string;
  cityName: string; cityHref: string; category: string; service: string; images: string[];
  status: 'Published' | 'Paused' | 'Pending' | 'Rejected'; sample: false; createdAt: string;
};
export type MemberSession = {
  id: string; email: string; username: string; emailVerified: boolean; posts: MemberPost[]; verificationRequested?: boolean;
};

function publicImage(variants: unknown) {
  if (!variants || typeof variants !== 'object') return [];
  const values = Object.values(variants as Record<string, unknown>);
  return values.filter((value): value is string => typeof value === 'string').slice(0, 1);
}
function mapPost(post: Record<string, unknown>): MemberPost {
  const status = String(post.status || 'pending');
  return {
    id: String(post.id), title: String(post.title), description: String(post.description), age: Number(post.age || 0),
    location: String(post.location || ''), phone: String(post.phone || ''), cityName: String(post.city_name || 'Selected city'), cityHref: String(post.city_href || '#'),
    category: String(post.category_slug || ''), service: String(post.category_slug || ''), images: publicImage(post.image),
    status: status === 'published' ? 'Published' : status === 'paused' ? 'Paused' : status === 'rejected' ? 'Rejected' : 'Pending', sample: false, createdAt: String(post.created_at || ''),
  };
}

export function useMember() {
  const [member, setMember] = useState<MemberSession | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!me.ok) { setMember(null); return; }
      const { user } = await me.json();
      const ads = await fetch('/api/account/ads', { credentials: 'same-origin', cache: 'no-store' });
      const data = ads.ok ? await ads.json() : { posts: [] };
      setMember({ id: user.id, email: user.email, username: user.username, emailVerified: Boolean(user.email_verified_at), posts: (data.posts || []).map(mapPost) });
    } catch { setMember(null); } finally { setReady(true); }
  }, []);
  useEffect(() => {
    void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener('bpn-session-change', changed);
    return () => window.removeEventListener('bpn-session-change', changed);
  }, [refresh]);
  return { member, ready, refresh };
}

export async function logOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.dispatchEvent(new Event('bpn-session-change'));
}
