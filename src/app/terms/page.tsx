import type { Metadata } from 'next';
import { LegalPage } from '../../components/legal-page';

export const metadata: Metadata = { title: 'Terms of Service', description: 'BackpageNew terms of service.' };

export default function TermsPage() {
  return <LegalPage title="Terms of Service" summary="These terms govern your use of BackpageNew and its local-classified services.">
    <section><h2>Acceptance and eligibility</h2><p>By using BackpageNew, you agree to these terms and our Privacy Policy. You must be at least 18 years old and able to enter into a binding agreement where you use the service.</p></section>
    <section><h2>Your account</h2><p>You are responsible for keeping your account credentials secure and for activity performed through your account. Provide accurate information and notify us promptly if you believe your account has been used without permission.</p></section>
    <section><h2>Listings and content</h2><p>You are responsible for the accuracy, legality, and permissions for every listing, message, and image you submit. You may not publish unlawful, deceptive, infringing, harassing, exploitative, or otherwise prohibited content. Follow our Guidelines and all applicable laws.</p></section>
    <section><h2>Moderation</h2><p>We may review, reject, edit, pause, remove, or restrict content or accounts to protect users, enforce these terms, respond to reports, or comply with law. We do not guarantee that all content will be reviewed before it appears.</p></section>
    <section><h2>Your license to us</h2><p>You retain ownership of content you submit. You grant BackpageNew a limited, non-exclusive right to host, reproduce, process, and display that content only as needed to operate, promote, secure, and improve the service.</p></section>
    <section><h2>Service availability</h2><p>The service is provided on an "as available" basis. We may change, suspend, or discontinue features when necessary. We are not responsible for communications or transactions between users and third parties.</p></section>
    <section><h2>Termination</h2><p>You may stop using the service at any time. We may suspend or terminate access when we reasonably believe these terms, our rules, or applicable law have been violated.</p></section>
    <section><h2>Changes and contact</h2><p>We may update these terms as the service evolves. Continued use after an update means you accept the revised terms. Questions can be sent to <a href="mailto:support@backpagenew.com">support@backpagenew.com</a>.</p></section>
  </LegalPage>;
}
