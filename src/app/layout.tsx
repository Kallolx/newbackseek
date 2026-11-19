import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { SiteToaster } from '../components/toast';
import type { Metadata } from 'next';
import { preconnect } from 'react-dom';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/manrope/wght.css';
import './globals.css';
import Script from 'next/script';
import { getSeo, SITE_ORIGIN } from '../lib/seo';

// Pages built ahead of time refresh their SEO text at most every 2 minutes (and sooner when the admin saves).
export const revalidate = 120;

// Site-wide metadata comes from Admin → SEO (page-specific titles, descriptions and canonical tags are set by each page).
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSeo();
  const verification = settings.verification;
  return {
    metadataBase: new URL(SITE_ORIGIN),
    applicationName: settings.site.name,
    title: { default: settings.templates.home.title, template: '%s' },
    description: settings.site.description,
    icons: { icon: '/brand/backpagenew-favicon.svg' },
    ...(settings.indexing.siteNoindex ? { robots: { index: false, follow: false } } : {}),
    verification: { google: verification.google || undefined, yandex: verification.yandex || undefined, other: { ...(verification.bing ? { 'msvalidate.01': verification.bing } : {}), ...(verification.baidu ? { 'baidu-site-verification': verification.baidu } : {}), ...(verification.pinterest ? { 'p:domain_verify': verification.pinterest } : {}) } },
    // Honest age labelling keeps filters and SafeSearch classifying the site correctly.
    ...(settings.indexing.adultRating ? { other: { rating: ['adult', 'RTA-5042-1996-1400-1577-RTA'] } } : {}),
  };
}

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { settings } = await getSeo();
  // Open the connection to the picture server before the first image is needed.
  preconnect(process.env.NEXT_PUBLIC_MEDIA_ORIGIN || 'https://media.backpagenew.com');
  return <html lang="en" suppressHydrationWarning><head>
    {/* Returning visitors: adult listings (18+ confirmed) and the member links in the header show at first paint. */}
    <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('bpn-adult-confirmed')==='yes')document.documentElement.dataset.adult='yes'}catch(e){}try{if(localStorage.getItem('bpn-member')==='1')document.documentElement.dataset.member='yes'}catch(e){}" }} />
  </head><body>
    <a className="skip" href="#main">Skip to content</a>
    <SiteHeader />
    {children}
    <SiteFooter />
    <SiteToaster />
    {/* Analytics (optional, set in Admin → SEO). Loaded after the page is ready so it never slows the first view. */}
    {settings.analytics.ga4 && <><Script src={`https://www.googletagmanager.com/gtag/js?id=${settings.analytics.ga4}`} strategy="lazyOnload" /><Script id="ga4" strategy="lazyOnload">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${settings.analytics.ga4}',{anonymize_ip:true});`}</Script></>}
    {settings.analytics.cloudflareBeacon && <Script src="https://static.cloudflareinsights.com/beacon.min.js" strategy="lazyOnload" data-cf-beacon={JSON.stringify({ token: settings.analytics.cloudflareBeacon })} />}
  </body></html>;
}


