'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FiEdit2, FiMoreVertical, FiPause, FiSend, FiTrash2 } from 'react-icons/fi';
import { toast } from '../components/toast';
import { goTo } from './navigation';
import styles from './member.module.css';

export function AdActions({ id, status, onChange }: { id: string; status: string; onChange: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);
  async function action(kind: 'delete' | 'paused' | 'pending') {
    setOpen(false); setBusy(true);
    try {
      const response = await fetch(`/api/account/ads/${id}` + (kind === 'delete' ? '' : '/status'), { method: kind === 'delete' ? 'DELETE' : 'POST', headers: kind === 'delete' ? undefined : { 'content-type': 'application/json' }, body: kind === 'delete' ? undefined : JSON.stringify({ status: kind }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'The ad could not be updated.');
      window.dispatchEvent(new Event('bpn-session-change'));
      dialog.current?.close();
      toast.success(kind === 'delete' ? 'Ad deleted.' : kind === 'paused' ? 'Ad paused.' : 'Ad submitted for review.');
      if (kind === 'delete') goTo('/myaccount', true); else onChange();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Please try again.'); } finally { setBusy(false); }
  }
  return <>
    <div className={styles.adMenuWrap} ref={menuRef}>
      <span className={styles.postStatus} data-paused={status === 'paused'}>{status[0]?.toUpperCase() + status.slice(1)}</span>
      <button className={styles.adMenuButton} type="button" aria-label="Manage this ad" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(value => !value)}><FiMoreVertical aria-hidden="true" /></button>
      {open && <div className={styles.adMenu} role="menu">
        <Link role="menuitem" href={`/myaccount/posts/${id}/edit`} onClick={() => setOpen(false)}><FiEdit2 aria-hidden="true" /> Edit ad</Link>
        {status === 'published' && <button role="menuitem" type="button" onClick={() => void action('paused')}><FiPause aria-hidden="true" /> Pause</button>}
        {['paused', 'rejected', 'draft'].includes(status) && <button role="menuitem" type="button" onClick={() => void action('pending')}><FiSend aria-hidden="true" /> Submit for review</button>}
        <button role="menuitem" type="button" className={styles.adMenuDanger} onClick={() => { setOpen(false); dialog.current?.showModal(); }}><FiTrash2 aria-hidden="true" /> Delete</button>
      </div>}
    </div>
    <dialog ref={dialog} className={styles.confirmDialog}><h2>Delete this ad?</h2><p>It will be removed from your ads and all public city listings.</p><div className={styles.ownerActions}><button className={styles.secondary} disabled={busy} onClick={() => dialog.current?.close()}>Keep ad</button><button className={styles.danger} disabled={busy} onClick={() => void action('delete')}>{busy ? 'Deleting…' : 'Delete ad'}</button></div></dialog>
  </>;
}
