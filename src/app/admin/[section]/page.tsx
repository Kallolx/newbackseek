import { notFound } from 'next/navigation';
import { adminRoutes } from '../admin-routes';

function label(section: string) {
  const entry = Object.entries(adminRoutes).find(([, path]) => path === '/admin/' + section);
  if (!entry) notFound();
  return entry[0] === 'Ads' ? 'All Ads' : entry[0] === 'Publish' ? 'Ad Publish' : entry[0];
}

export function generateStaticParams() { return Object.values(adminRoutes).filter((path) => path !== '/admin').map((path) => ({ section: path.split('/').pop()! })); }
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) { return { title: label((await params).section) }; }
export default async function AdminSection({ params }: { params: Promise<{ section: string }> }) { label((await params).section); return null; }
