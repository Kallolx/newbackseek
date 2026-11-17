'use client';

import { FeedbackToast } from './toast';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCopy, FiDownload, FiShare2, FiX } from 'react-icons/fi';

// Replace this single path with the Cloudflare R2 public URL when media storage is enabled.
const QR_IMAGE_URL = '/brand/backpagenew-qr.svg';
const SITE_URL = 'https://backpagenew.com/';

export function QrDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState(SITE_URL);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setUrl(window.location.origin + '/');
    dialog.current?.showModal();
  }, []);

  function close() {
    dialog.current?.close();
    onClose();
  }

  async function share() {
    try {
      const image = await fetch(QR_IMAGE_URL).then((response) => response.blob());
      const file = new File([image], 'backpage-new-qr.svg', { type: 'image/svg+xml' });
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
        <Image src={QR_IMAGE_URL} alt={'QR code for ' + SITE_URL} width={260} height={260} priority unoptimized />
      </div>
      <p className="qr-url">{url}</p>
      <div className="qr-actions">
        <a href={QR_IMAGE_URL} download="backpage-new-qr.svg"><FiDownload aria-hidden="true" />Download QR</a>
        <button type="button" onClick={() => void share()}><FiShare2 aria-hidden="true" />Share</button>
        <button type="button" onClick={() => void copy()}>{message.startsWith('Site link copied') ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}Copy link</button>
      </div>
      <FeedbackToast message={message} type="info" />
    </dialog>
  );
}
