import type { Metadata } from 'next';
import { countries } from '../../directory/areas';
import { serviceGroups } from '../../directory/service-groups';
import { AdminDashboard } from './dashboard';

export const metadata: Metadata = {
  title: 'Admin | BackpageNew',
  robots: { index: false, follow: false },
};

const locations = countries.map(({ code, name, regions }) => ({
  code,
  name,
  regions: regions.map(({ name, href, cities }) => ({
    name,
    id: href,
    cities: cities.map(({ name, href }) => ({ name, id: href })),
  })),
}));

export default function AdminPage() {
  return <AdminDashboard locations={locations} categories={serviceGroups} />;
}
