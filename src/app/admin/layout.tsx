import type { Metadata } from 'next';
import { countries } from '../../directory/areas';
import { serviceGroups } from '../../directory/service-groups';
import { AdminProvider } from './admin-provider';
import { AdminDashboard } from './dashboard';

export const metadata: Metadata = { title: { default: 'Admin – BackpageNew', template: '%s – BackpageNew Admin' }, robots: { index: false, follow: false } };

const locations = countries.map(({ code, name, regions }) => ({ code, name, regions: regions.map(({ name, href, cities }) => ({ name, id: href, cities: cities.map(({ name, href }) => ({ name, id: href })) })) }));

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminProvider><AdminDashboard locations={locations} categories={serviceGroups} />{children}</AdminProvider>;
}
