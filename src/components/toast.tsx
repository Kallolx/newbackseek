'use client';

import { useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';

export function SiteToaster() {
  return <Toaster position="top-center" richColors closeButton duration={5000} toastOptions={{ style: { fontFamily: 'inherit', borderRadius: '10px' } }} />;
}

// Keeps action feedback consistent while static form guidance stays beside its fields.
export function FeedbackToast({ message, type = 'error' }: { message: string; type?: 'error' | 'success' | 'info' }) {
  const last = useRef('');
  useEffect(() => {
    if (message && message !== last.current) toast[type](message);
    last.current = message;
  }, [message, type]);
  return null;
}

export { toast };
