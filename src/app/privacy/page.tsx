import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/seo';
import { LegalPage } from '../../components/legal-page';

export async function generateMetadata(): Promise<Metadata> { return pageMetadata({ path: '/privacy', kind: 'page', title: 'Privacy Policy – BackpageNew', description: 'How BackpageNew handles information when you browse, create an account or post ads.' }); }

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" summary="How BackpageNew handles information when you browse, create an account, or use our services.">
    <section><h2>Information we collect</h2><p>We collect information you provide, such as your email address, username, account credentials, listing details, messages you send to support, and photos you upload. We also collect limited technical information needed to secure and operate the service, including device, browser, IP address, and activity records.</p></section>
    <section><h2>How we use information</h2><p>We use information to provide accounts and listings, process uploads, prevent abuse and fraud, review reports, communicate about your account, enforce our rules, and improve the reliability and security of the service.</p></section>
    <section><h2>Photos and verification</h2><p>Photos attached to a listing may be displayed publicly with that listing. Account-verification photos are handled separately for review and are not displayed publicly. Do not upload images you do not have permission to use.</p></section>
    <section><h2>When information is shared</h2><p>We do not sell personal information. We may share information with service providers that help us host the service, deliver email, store media, or protect against abuse, and when required to comply with applicable law or protect users and the service.</p></section>
    <section><h2>Retention and security</h2><p>We keep information only for as long as reasonably needed for the purposes described here, including safety, dispute resolution, and legal obligations. We use reasonable administrative and technical safeguards, but no online service can guarantee absolute security.</p></section>
    <section><h2>Your choices</h2><p>You may request account assistance, correction, or deletion by contacting us. Some information may need to be retained where required for security, fraud prevention, or legal compliance.</p></section>
    <section><h2>Adults only</h2><p>BackpageNew is intended for adults aged 18 or older. We do not knowingly collect information from anyone under 18.</p></section>
    <section><h2>Changes and contact</h2><p>We may update this policy as the service changes. The effective date above will be updated when material changes are posted. For privacy questions, contact <a href="mailto:support@backpagenew.com">support@backpagenew.com</a>.</p></section>
  </LegalPage>;
}
