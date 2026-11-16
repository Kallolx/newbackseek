'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { IoQrCodeOutline } from 'react-icons/io5';

const QrDialog = dynamic(() => import('./qr-dialog').then(({ QrDialog }) => QrDialog), {
  ssr: false,
});

export function HeaderQr() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="header-qr-button" type="button" aria-label="Open site QR code" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <IoQrCodeOutline size={22} aria-hidden="true" />
      </button>
      {open && <QrDialog onClose={() => setOpen(false)} />}
    </>
  );
}
