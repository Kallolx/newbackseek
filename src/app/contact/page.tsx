import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/seo';
import Link from 'next/link';
import { FiAlertTriangle, FiBookOpen, FiMail } from 'react-icons/fi';
import { ContactForm } from './contact-form';

export async function generateMetadata(): Promise<Metadata> { return pageMetadata({ path: '/contact', kind: 'page', title: 'Contact BackpageNew – Support & Questions', description: 'Contact the BackpageNew team about your account, an ad, payments or a problem. We reply by email.' }); }

export default function ContactPage() {
  return <main id="main" className="contact-page shell">
    <header className="blog-head"><p className="legal-kicker">BackpageNew</p><h1>Contact us</h1></header>
    <div className="contact-layout">
      <section className="contact-card" aria-label="Contact form"><ContactForm /></section>
      <aside className="contact-side">
        <div><FiMail /><div><strong>Email</strong><a href="mailto:support@backpagenew.com">support@backpagenew.com</a></div></div>
        <div><FiAlertTriangle /><div><strong>Report an ad</strong><span>Use “Report this ad” in the menu on the ad page.</span></div></div>
        <div><FiBookOpen /><div><strong>Before you write</strong><span><Link href="/guidelines">Guidelines</Link> · <Link href="/refund-policy">Refund Policy</Link> · <Link href="/blog">Blog</Link></span></div></div>
      </aside>
    </div>
  </main>;
}
