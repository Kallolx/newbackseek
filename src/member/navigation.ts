'use client';

import type { MouseEvent } from 'react';

/**
 * Moves between account pages in the browser, without asking the server for a new page.
 * Everything on these pages is loaded by the browser anyway, so a server round trip only
 * delays the switch and flashes a loading screen. Back and Forward keep working.
 */
export function goTo(path: string, replace = false) {
  if (window.location.pathname + window.location.search === path) { window.scrollTo(0, 0); return; }
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.scrollTo(0, 0);
}

/** Capture-phase click handler for the account area: turns /myaccount links into in-browser moves. */
export function accountLinkClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || !/^\/myaccount(\/|$)/.test(url.pathname)) return;
  event.preventDefault();
  event.stopPropagation();
  goTo(url.pathname + url.search);
}

const SECTIONS = ['post', 'wallet', 'verification', 'settings'];
/** Section segments for a /myaccount path, or null when the address is not an account page. */
export function accountSection(pathname: string): string[] | null {
  const section = pathname.replace(/^\/myaccount\/?/, '').split('/').filter(Boolean);
  const ok = section.length === 0
    || (section.length === 1 && SECTIONS.includes(section[0]))
    || (section.length === 2 && section[0] === 'posts' && /^\d+$/.test(section[1]))
    || (section.length === 3 && section[0] === 'posts' && /^\d+$/.test(section[1]) && section[2] === 'edit');
  return ok ? section : null;
}
