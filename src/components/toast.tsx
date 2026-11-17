'use client';

import { useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';

export function SiteToaster() {
  return <Toaster position="bottom-center" closeButton duration={5000} visibleToasts={2} gap={8} offset={20} mobileOffset={{bottom:'calc(12px + env(safe-area-inset-bottom))',left:12,right:12}} toastOptions={{ className:'site-toast',style: { fontFamily: 'inherit', borderRadius: '10px' } }} />;
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
