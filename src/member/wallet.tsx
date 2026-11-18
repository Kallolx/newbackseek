'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FiArrowLeft, FiClock, FiCreditCard, FiInfo, FiPlus, FiZap } from 'react-icons/fi';
import { SiBitcoin, SiEthereum, SiLitecoin, SiSolana, SiTether } from 'react-icons/si';
import type { IconType } from 'react-icons';
import styles from './member.module.css';

// Design preview: crypto top-ups are not connected yet, so nothing here takes payment or shows a payment address.
type Coin = { id: string; name: string; network: string; icon: IconType; color: string };
const coins: Coin[] = [
  { id: 'usdt-trc20', name: 'USDT', network: 'Tron (TRC-20)', icon: SiTether, color: '#26a17b' },
  { id: 'usdt-erc20', name: 'USDT', network: 'Ethereum (ERC-20)', icon: SiTether, color: '#26a17b' },
  { id: 'btc', name: 'Bitcoin', network: 'BTC', icon: SiBitcoin, color: '#f7931a' },
  { id: 'eth', name: 'Ethereum', network: 'ETH', icon: SiEthereum, color: '#627eea' },
  { id: 'ltc', name: 'Litecoin', network: 'LTC', icon: SiLitecoin, color: '#345d9d' },
  { id: 'sol', name: 'Solana', network: 'SOL', icon: SiSolana, color: '#9945ff' },
];
const amounts = [10, 25, 50, 100, 250];

export function Wallet() {
  const [amount, setAmount] = useState(25);
  const [custom, setCustom] = useState('');
  const [coin, setCoin] = useState(coins[0].id);
  const [review, setReview] = useState(false);
  const value = custom ? Number(custom) : amount;
  const valid = Number.isFinite(value) && value >= 5 && value <= 5000;
  const selected = coins.find((item) => item.id === coin)!;
  const Icon = selected.icon;

  return <section className={styles.wallet}>
    <div className={styles.heading}><div><h1>Wallet</h1></div></div>

    <div className={styles.balance}>
      <div><span>Balance</span><strong>0.00</strong><small>credits · 1 credit = $1.00</small></div>
      <span className={styles.balanceIcon}><FiCreditCard /></span>
    </div>
    <p className={styles.walletNote}><FiInfo /> Posting is free for now. Credits will pay for ads later.</p>

    <section className={styles.settingsCard} aria-labelledby="topup-title">
      <header><span className={styles.settingsIcon}><FiPlus /></span><h2 id="topup-title">Top up</h2><span className={styles.pillOff}>Coming soon</span></header>
      {review ? <div className={styles.review}>
        <button type="button" className={styles.linkButton} onClick={() => setReview(false)}><FiArrowLeft /> Change</button>
        <div className={styles.reviewSummary}>
          <span className={styles.coinIcon} style={{ color: selected.color }}><Icon /></span>
          <div><strong>{value.toFixed(2)} credits</strong><small>Pay ${value.toFixed(2)} in {selected.name} · {selected.network}</small></div>
        </div>
        <div className={styles.comingSoon}>
          <FiClock />
          <div><strong>Crypto top-ups open soon</strong><p>When they do, you will get a one-time payment address and QR code here, and credits arrive after the network confirms the payment.</p></div>
        </div>
      </div> : <>
        <p className={styles.fieldLabel}>Amount (USD)</p>
        <div className={styles.amounts} role="radiogroup" aria-label="Top-up amount">
          {amounts.map((option) => <button key={option} type="button" role="radio" aria-checked={!custom && amount === option} onClick={() => { setAmount(option); setCustom(''); }}>${option}</button>)}
          <label className={styles.customAmount}><span>$</span><input inputMode="decimal" placeholder="Other" aria-label="Other amount" value={custom} onChange={(event) => setCustom(event.target.value.replace(/[^\d.]/g, '').slice(0, 7))} /></label>
        </div>
        {custom && !valid && <p className={styles.help}>Enter between $5 and $5,000.</p>}
        <p className={styles.fieldLabel}>Pay with</p>
        <div className={styles.coins} role="radiogroup" aria-label="Cryptocurrency">
          {coins.map((item) => { const CoinIcon = item.icon; return <button key={item.id} type="button" role="radio" aria-checked={coin === item.id} onClick={() => setCoin(item.id)}>
            <span className={styles.coinIcon} style={{ color: item.color }}><CoinIcon /></span><span><strong>{item.name}</strong><small>{item.network}</small></span>
          </button>; })}
        </div>
        <div className={styles.topupFooter}>
          <span>You get <strong>{valid ? value.toFixed(2) : '—'} credits</strong></span>
          <button type="button" className={styles.primary} disabled={!valid} onClick={() => setReview(true)}><FiZap /> Continue</button>
        </div>
      </>}
    </section>

    <section className={styles.settingsCard} aria-labelledby="history-title">
      <header><span className={styles.settingsIcon}><FiClock /></span><h2 id="history-title">History</h2></header>
      <p className={styles.cardText}>No top-ups or payments yet.</p>
    </section>

    <p className={styles.walletLinks}><Link href="/refund-policy">Refund policy</Link> · <Link href="/contact">Wallet help</Link></p>
  </section>;
}
