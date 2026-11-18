import type { Metadata } from 'next';
import { AccountArea } from '../../../member/account-area';

export const metadata: Metadata = { title: 'My account | BackpageNew', robots: { index: false, follow: false } };

// The account pages are rendered by the browser (it loads everything itself), so they are
// built once. Ad numbers (/myaccount/posts/123) are built on first use.
export function generateStaticParams() {
  return [{ section: [] }, { section: ['post'] }, { section: ['verification'] }, { section: ['settings'] }];
}

export default function AccountPage() {
  return <AccountArea />;
}
