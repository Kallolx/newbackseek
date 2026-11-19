import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/seo';
import Link from 'next/link';
import { LegalPage } from '../../components/legal-page';

export async function generateMetadata(): Promise<Metadata> { return pageMetadata({ path: '/refund-policy', kind: 'page', title: 'Refund Policy – Wallet Credits & Crypto Top-ups | BackpageNew', description: 'How BackpageNew wallet credits, cryptocurrency top-ups and refunds work.' }); }

export default function RefundPolicyPage() {
  return <LegalPage title="Refund Policy" date="November 19, 2026" summary="How wallet credits, cryptocurrency top-ups and refunds work on BackpageNew.">
    <section><h2>Wallet credits</h2><p>Credits are a prepaid balance in your account that can be used only for BackpageNew services, such as posting or promoting ads. One credit equals one US dollar at the time of top-up. Credits are not money, do not earn interest, cannot be transferred to another account and cannot be exchanged for cash except as described below.</p></section>
    <section><h2>Cryptocurrency top-ups</h2><p>Top-ups are made in supported cryptocurrencies on the network shown on the payment screen. The amount of credits is fixed when the payment address is created and stays valid for the time shown. Credits are added after the payment receives the required network confirmations.</p><ul>
      <li>Send the exact amount, in the coin and on the network shown. Payments sent on the wrong network or in an unsupported coin may not be recoverable.</li>
      <li>Network and exchange fees are paid by the sender and are not refunded.</li>
      <li>If you send less than requested, we credit the value received. If you send more, the difference is added as credits.</li>
      <li>Payments that arrive after the payment window ends are credited at the rate when they are confirmed.</li>
    </ul></section>
    <section><h2>Unused credits</h2><p>You may request a refund of unused credits from a top-up within 14 days of that top-up, as long as none of that top-up has been spent. Refunds are paid in the same cryptocurrency to an address you provide and verify, at its value on the day of the refund, minus the network fee. Credits received as promotions or bonuses are not refundable.</p></section>
    <section><h2>Credits already used</h2><p>Credits spent on a service are not refundable once that service has been delivered, for example once an ad has been published or promoted. If an ad is rejected in review before it is published, the credits spent on it are returned to your wallet.</p></section>
    <section><h2>Service problems</h2><p>If a paid service fails because of a fault on our side, we return the credits spent on it to your wallet or, if you prefer, refund them as unused credits.</p></section>
    <section><h2>Removed content and closed accounts</h2><p>Credits spent on ads removed for breaking our <Link href="/guidelines">Guidelines</Link> are not returned. If we close an account for fraud, chargeback abuse, illegal activity or serious violations, its remaining credits may be forfeited where the law allows. If you close your own account, request a refund of eligible unused credits first.</p></section>
    <section><h2>How to request a refund</h2><p>Use the <Link href="/contact">contact page</Link> and choose “Wallet and payments”. Include your username, the date and amount of the top-up and the transaction ID. We answer within 5 business days and may ask you to confirm the request from your account.</p></section>
    <section><h2>Changes</h2><p>We may update this policy. Changes apply to top-ups made after the new version is published. Your statutory rights as a consumer are not affected.</p></section>
  </LegalPage>;
}
