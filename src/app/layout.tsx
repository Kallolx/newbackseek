import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { SiteToaster } from '../components/toast';
import type { Metadata } from 'next';
import { preconnect } from 'react-dom';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/manrope/wght.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BackpageNew – Local Classifieds, Personal Ads & Backpage Alternative', template: '%s – BackpageNew Local Classifieds & Personal Ads' },
  description: 'Explore local classifieds by city or region across the United States, Canada, the United Kingdom, and Australia.',
  icons: { icon: '/brand/backpagenew-favicon.svg' },
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Open the connection to the picture server before the first image is needed.
  preconnect(process.env.NEXT_PUBLIC_MEDIA_ORIGIN || 'https://media.backpagenew.com');
  return <html lang="en" suppressHydrationWarning><head>
    {/* Returning visitors who already confirmed 18+ see adult listings at first paint. */}
    <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('bpn-adult-confirmed')==='yes')document.documentElement.dataset.adult='yes'}catch(e){}" }} />
  </head><body>
    <a className="skip" href="#main">Skip to content</a>
    <SiteHeader />
    {children}
    <SiteFooter />
    <SiteToaster />
  </body></html>;
}


