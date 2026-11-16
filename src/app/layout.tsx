import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import type { Metadata } from 'next';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/manrope/wght.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BackpageNew – Local Classifieds, Personal Ads & Backpage Alternative', template: '%s – BackpageNew Local Classifieds & Personal Ads' },
  description: 'Explore local classifieds by city or region across the United States, Canada, the United Kingdom, and Australia.',
  icons: { icon: '/brand/backpagenew-favicon.svg' },
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <a className="skip" href="#main">Skip to content</a>
    <SiteHeader />
    {children}
    <SiteFooter />
  </body></html>;
}


