import type { Metadata } from 'next';
import { InfoPage } from '../../components/info-page';
import { landings } from '../../content/pages';
import { pageMetadata } from '../../lib/seo';

const page = landings['backpage-alternative'];
export async function generateMetadata(): Promise<Metadata> { return pageMetadata({ path: page.path, kind: 'page', title: page.title, description: page.description }); }
export default function Page() { return <InfoPage page={page} />; }
