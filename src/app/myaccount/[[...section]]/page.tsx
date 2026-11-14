import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccountArea } from '../../../member/account-area';

export const metadata: Metadata = { title: 'My account | BackpageNew', robots: { index: false, follow: false } };

export default async function AccountPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  if (!(section.length === 0 || (section.length === 1 && ['post', 'verification', 'settings'].includes(section[0])) || (section.length === 2 && section[0] === 'posts'))) notFound();
  return <AccountArea section={section} />;
}
