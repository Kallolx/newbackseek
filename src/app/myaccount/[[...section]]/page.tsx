import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccountArea } from '../../../member/account-area';

export const metadata: Metadata = { title: 'My account | BackpageNew', robots: { index: false, follow: false } };

export default async function AccountPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  if (!(section.length === 0 || (section.length === 1 && ['post', 'verification', 'settings'].includes(section[0])) || (section.length === 2 && section[0] === 'posts'&&/^\d+$/.test(section[1])) || (section.length===3&&section[0]==='posts'&&/^\d+$/.test(section[1])&&section[2]==='edit'))) notFound();
  return <AccountArea section={section} />;
}
