'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCopy, FiDownload, FiShare2, FiX } from 'react-icons/fi';

export function QrDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const siteUrl = window.location.origin + '/';
    setUrl(siteUrl);
    dialog.current?.showModal();
    let active = true;

    async function createQr() {
      try {
        const { default: QRCode } = await import('qrcode');
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, siteUrl, {
          width: 1024,
          margin: 4,
          errorCorrectionLevel: 'H',
          color: { dark: '#071d4d', light: '#ffffff' },
        });
        if (active) setQr(canvas.toDataURL('image/png'));
      } catch {
        if (active) setMessage('Could not generate the QR code. Please close and try again.');
      } finally {
        if (active) setBusy(false);
      }
    }

    void createQr();
    return () => { active = false; };
  }, []);

  function close() {
    dialog.current?.close();
    onClose();
  }

  async function share() {
    try {
      const bytes = Uint8Array.from(atob(qr.split(',')[1]), (character) => character.charCodeAt(0));
      const file = new File([bytes], 'backpage-new-qr.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'BackpageNew', text: url, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: 'BackpageNew', url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage('Site link copied. You can also download the QR image.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setMessage('Sharing is unavailable here. Use Download PNG to save the QR code.');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Site link copied.');
    } catch {
      setMessage('Copy is unavailable here. Select and copy the site link below the QR code.');
    }
  }

  return (
    <dialog ref={dialog} className="qr-dialog" aria-labelledby="qr-heading" onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
      <div className="qr-dialog-heading">
        <h2 id="qr-heading">Share BackpageNew</h2>
        <button type="button" aria-label="Close QR code" onClick={close}><FiX size={20} /></button>
      </div>
      <p>Scan to open the site.</p>
      <div className="qr-image">
        {qr ? <Image src={qr} alt={'QR code for ' + url} width={260} height={260} unoptimized /> : <span>{busy ? 'Creating QR code…' : 'QR code unavailable'}</span>}
      </div>
      <p className="qr-url">{url}</p>
      <div className="qr-actions">
        {qr && <a href={qr} download="backpage-new-qr.png"><FiDownload aria-hidden="true" />Download PNG</a>}
        <button type="button" disabled={!qr || busy} onClick={() => void share()}><FiShare2 aria-hidden="true" />Share</button>
        <button type="button" onClick={() => void copy()}>{message.startsWith('Site link copied') ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}Copy link</button>
      </div>
      <p className="qr-feedback" role="status">{message}</p>
    </dialog>
  );
}
