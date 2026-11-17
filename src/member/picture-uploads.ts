'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UploadStage = 'waiting' | 'preparing' | 'uploading' | 'processing' | 'ready' | 'failed';
export type PictureUpload = { key: string; preview: string; progress: number; stage: UploadStage; mediaId?: string; error?: string };

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const PARALLEL_UPLOADS = 3;
const POLL_MS = 450;
const MAX_EDGE = 1600;

/** Resize in the browser so only a small WebP (or JPEG on Safari) travels over the network. */
async function preparePhoto(file: File): Promise<Blob> {
  const blob = await encode(file, 'image/webp');
  // Safari cannot encode WebP and silently returns a large PNG instead.
  return blob.type === 'image/webp' ? blob : encode(file, 'image/jpeg');
}

async function encode(file: File, type: 'image/webp' | 'image/jpeg'): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (context) { context.drawImage(bitmap, 0, 0, width, height); return await canvas.convertToBlob({ type, quality: 0.82 }); }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare this picture.');
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare this picture.')), type, 0.82));
  } finally { bitmap.close(); }
}

function putWithProgress(url: string, body: Blob, onProgress: (fraction: number) => void, register: (xhr: XMLHttpRequest) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', body.type);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed.'));
    xhr.onerror = () => reject(new Error('Network problem while uploading.'));
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));
    xhr.send(body);
  });
}

export function validatePicture(file: File) {
  if (!ACCEPTED.includes(file.type)) return 'Choose JPG, PNG, WebP or AVIF pictures.';
  if (file.size > 10 * 1024 * 1024) return 'Each picture must be under 10 MB.';
  return '';
}

/**
 * Uploads pictures as soon as they are chosen (three at a time) and tracks
 * each one from 0 to 100% — 100% means the server has finished processing it.
 */
export function usePictureUploads() {
  const [items, setItems] = useState<PictureUpload[]>([]);
  const files = useRef(new Map<string, File>());
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const removed = useRef(new Set<string>());
  const running = useRef(0);
  const started = useRef(new Set<string>());
  const itemsRef = useRef(items);
  const [pollTick, setPollTick] = useState(0);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const patch = useCallback((key: string, value: Partial<PictureUpload>) => {
    setItems(list => list.map(item => item.key === key ? { ...item, ...value } : item));
  }, []);

  const run = useCallback(async (key: string) => {
    const file = files.current.get(key);
    if (!file) return;
    try {
      patch(key, { stage: 'preparing', progress: 4, error: undefined });
      const body = await preparePhoto(file);
      if (removed.current.has(key)) return;
      patch(key, { progress: 10 });
      const create = await fetch('/api/media/uploads', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes: body.size, contentType: body.type, purpose: 'ad' }) });
      const upload = await create.json().catch(() => ({}));
      if (!create.ok) throw new Error(upload.error || 'Could not start this upload.');
      if (removed.current.has(key)) return;
      patch(key, { stage: 'uploading', progress: 12, mediaId: upload.id });
      await putWithProgress(upload.url, body, fraction => patch(key, { progress: Math.round(12 + fraction * 70) }), xhr => requests.current.set(key, xhr));
      requests.current.delete(key);
      if (removed.current.has(key)) return;
      const complete = await fetch(`/api/media/${upload.id}/complete`, { method: 'POST', credentials: 'same-origin' });
      const result = await complete.json().catch(() => ({}));
      if (!complete.ok) throw new Error(result.error || 'Could not finish this upload.');
      patch(key, { stage: result.status === 'ready' ? 'ready' : 'processing', progress: result.status === 'ready' ? 100 : 84 });
    } catch (cause) {
      requests.current.delete(key);
      if (removed.current.has(key) || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      patch(key, { stage: 'failed', error: cause instanceof Error ? cause.message : 'Upload failed.' });
    }
  }, [patch]);

  // Start waiting uploads while fewer than PARALLEL_UPLOADS are in flight.
  useEffect(() => {
    const waiting = items.filter(item => item.stage === 'waiting');
    for (const item of waiting) {
      if (running.current >= PARALLEL_UPLOADS) break;
      if (started.current.has(item.key)) continue;
      started.current.add(item.key);
      running.current += 1;
      patch(item.key, { stage: 'preparing', progress: 2 });
      void run(item.key).finally(() => { running.current -= 1; setItems(list => [...list]); });
    }
  }, [items, patch, run]);

  // One request checks every picture that is still being processed.
  const processingIds = items.filter(item => item.stage === 'processing' && item.mediaId).map(item => item.mediaId).join(',');
  useEffect(() => {
    if (!processingIds) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/media/status?ids=${processingIds}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const { media } = await response.json() as { media: { id: string; status: string }[] };
        const byId = new Map(media.map(row => [row.id, row.status]));
        setItems(list => list.map(item => {
          if (item.stage !== 'processing' || !item.mediaId) return item;
          const status = byId.get(item.mediaId);
          if (status === 'ready') return { ...item, stage: 'ready', progress: 100 };
          if (status === 'failed') return { ...item, stage: 'failed', error: 'This picture could not be processed. Try another one.' };
          return { ...item, progress: Math.min(97, item.progress + 4) };
        }));
      } catch {} finally { if (!cancelled) setPollTick(tick => tick + 1); }
    }, POLL_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [processingIds, pollTick]);

  const add = useCallback((chosen: File[]) => {
    const next = chosen.map(file => {
      const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
      files.current.set(key, file);
      return { key, preview: URL.createObjectURL(file), progress: 0, stage: 'waiting' as UploadStage };
    });
    setItems(list => [...list, ...next]);
  }, []);

  const remove = useCallback((key: string) => {
    removed.current.add(key);
    started.current.delete(key);
    requests.current.get(key)?.abort();
    requests.current.delete(key);
    files.current.delete(key);
    setItems(list => {
      const item = list.find(entry => entry.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter(entry => entry.key !== key);
    });
  }, []);

  const retry = useCallback((key: string) => { started.current.delete(key); patch(key, { stage: 'waiting', progress: 0, error: undefined, mediaId: undefined }); }, [patch]);

  /** Resolves once every picture is uploaded and (within maxWaitMs) processed. */
  const settle = useCallback(async (onUpdate: (list: PictureUpload[]) => void, maxProcessingWaitMs = 8000) => {
    const startedProcessingWait = { at: 0 };
    for (;;) {
      const list = itemsRef.current;
      onUpdate(list);
      const failed = list.find(item => item.stage === 'failed');
      if (failed) throw new Error('A picture failed to upload. Retry or remove it, then submit again.');
      const inFlight = list.some(item => ['waiting', 'preparing', 'uploading'].includes(item.stage));
      const processing = list.some(item => item.stage === 'processing');
      if (!inFlight && !processing) return list;
      if (!inFlight && processing) {
        if (!startedProcessingWait.at) startedProcessingWait.at = Date.now();
        // Finished pictures are attached immediately; the server completes any stragglers.
        if (Date.now() - startedProcessingWait.at > maxProcessingWaitMs) return list;
      }
      await new Promise(resolve => window.setTimeout(resolve, 150));
    }
  }, []);

  useEffect(() => () => { for (const xhr of requests.current.values()) xhr.abort(); }, []);

  return { items, add, remove, retry, settle };
}
