'use client';

import Script from 'next/script';
import { useEffect, useId, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; theme?: 'light' | 'dark'; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ onToken, onError }: { onToken: (token: string) => void; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const id = useId();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const renderWidget = () => {
    if (!siteKey || !host.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(host.current, { sitekey: siteKey, theme: 'light', callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': onError });
  };
  useEffect(() => () => { if (widget.current && window.turnstile) window.turnstile.remove(widget.current); }, []);
  if (!siteKey) return <p className="security-error">Security check is unavailable. Please refresh or contact support.</p>;
  return <><Script id={`turnstile-${id}`} src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={renderWidget} /><div ref={host} className="turnstile-widget" aria-label="Security check" /></>;
}
