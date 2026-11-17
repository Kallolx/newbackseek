import type { Metadata } from 'next';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/manrope/wght.css';
import '../../src/app/globals.css';
import './admin-login.css';
import { SiteToaster } from '../../src/components/toast';
export const metadata: Metadata = { title: { default: 'BackpageNew Admin', template: '%s | BackpageNew Admin' }, icons: { icon: '/brand/backpagenew-favicon.svg' }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}<SiteToaster /></body></html>; }
