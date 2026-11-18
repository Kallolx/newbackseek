import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '../../components/legal-page';

export const metadata: Metadata = { title: 'Guidelines', description: 'Rules for posting and using BackpageNew.' };

export default function GuidelinesPage() {
  return <LegalPage title="Community Guidelines" date="November 19, 2026" summary="The rules every listing and account on BackpageNew must follow. They apply together with our Terms of Service and Privacy Policy.">
    <section><h2>Who can use BackpageNew</h2><p>You must be at least 18 years old and legally able to use the service where you live. One person may hold one account. Accounts, credits and listings may not be sold, shared or transferred.</p></section>
    <section><h2>Strictly prohibited</h2><p>Any of the following leads to removal and may lead to a permanent ban and a report to the authorities:</p><ul>
      <li>Any content involving minors, or anyone who appears to be under 18.</li>
      <li>Human trafficking, coercion, exploitation or anything offered without the full, free consent of the people involved.</li>
      <li>Offering or requesting illegal services, sexual services in exchange for money, or anything unlawful where it is offered.</li>
      <li>Illegal drugs, weapons, stolen goods, counterfeit items or forged documents.</li>
      <li>Threats, harassment, hate speech or content that targets people for who they are.</li>
      <li>Pictures or personal details of another person without their permission.</li>
    </ul></section>
    <section><h2>Listings</h2><ul>
      <li>Describe accurately what you offer. Misleading titles, prices or photos are not allowed.</li>
      <li>Post in the city and category that fit the listing. Do not post the same ad repeatedly or in unrelated places.</li>
      <li>Use only photos you took or have the right to use. No watermarks or contact details for other sites in photos.</li>
      <li>No links to malware, phishing pages or sites that try to take people away from safe communication.</li>
      <li>Ages stated in a listing must be true. We may ask for verification at any time.</li>
    </ul></section>
    <section><h2>Spam and abuse of the service</h2><p>Automated posting, mass messaging, fake accounts, manipulating bumps or rankings, and attempts to get around a suspension or our security measures are not allowed.</p></section>
    <section><h2>Fraud and payments</h2><p>Never ask other members for deposits, gift cards, cryptocurrency or advance fees. BackpageNew does not handle payments between members. Wallet credits may only be used for BackpageNew services and are covered by our <Link href="/refund-policy">Refund Policy</Link>.</p></section>
    <section><h2>Verification badge</h2><p>The Verified badge means we checked that the account holder is a real person who matches the account. It is not an endorsement of a listing. Faking or misusing verification leads to removal of the account.</p></section>
    <section><h2>Reporting</h2><p>If an ad breaks these rules, use “Report this ad” on the ad page. For urgent danger, contact local emergency services first. You can also reach us through the <Link href="/contact">contact page</Link>.</p></section>
    <section><h2>Enforcement</h2><p>We may edit, pause, reject or remove listings, remove badges, suspend or close accounts, and cooperate with law enforcement where required by law. Credits in accounts closed for serious violations may be forfeited as described in the Refund Policy.</p></section>
  </LegalPage>;
}
