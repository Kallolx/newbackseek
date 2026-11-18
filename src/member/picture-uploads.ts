'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Pictures stay on the phone until the ad is submitted. Then each original file is
// sent to our API, which checks it and converts it to WebP on the server. The
// phone never decodes or re-encodes the photo (that failed on some phones).
export type UploadStage = 'waiting' | 'uploading' | 'uploaded' | 'failed';
export type PictureUpload = { key: string; preview: string; progress: number; stage: UploadStage; mediaId?: string; error?: string; name: string };

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_PICTURE_MB = 15;
const PARALLEL_UPLOADS = 2;

export function validatePicture(file: File) {
  if (/\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)) return 'iPhone HEIC photos are not supported. Pick the photo from the Photos app, or set Camera → Formats → "Most Compatible".';
  if (file.type && !ACCEPTED.includes(file.type)) return 'Choose JPG, PNG, WebP or AVIF pictures.';
  if (file.size > MAX_PICTURE_MB * 1024 * 1024) return `Each picture must be under ${MAX_PICTURE_MB} MB.`;
  return '';
}

function send(file: File, onProgress: (fraction: number) => void, register: (xhr: XMLHttpRequest) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open('POST', '/api/media/upload');
    xhr.withCredentials = true;
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => {
      let body: { id?: string; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve(body.id);
      else reject(new Error(body.error || (xhr.status === 413 ? `Each picture must be under ${MAX_PICTURE_MB} MB.` : 'This picture could not be uploaded.')));
    };
    xhr.onerror = () => reject(new Error('Network problem while uploading. Check your connection and submit again.'));
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));
    xhr.send(file);
  });
}

export function usePictureUploads() {
  const [items, setItems] = useState<PictureUpload[]>([]);
  const files = useRef(new Map<string, File>());
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const patch = useCallback((key: string, value: Partial<PictureUpload>) => {
    setItems(list => list.map(item => item.key === key ? { ...item, ...value } : item));
  }, []);

  /** Only adds local previews. Nothing leaves the phone yet. */
  const add = useCallback((chosen: File[]) => {
    const next = chosen.map(file => {
      const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
      files.current.set(key, file);
      return { key, name: file.name, preview: URL.createObjectURL(file), progress: 0, stage: 'waiting' as UploadStage };
    });
    setItems(list => [...list, ...next]);
  }, []);

  const remove = useCallback((key: string) => {
    requests.current.get(key)?.abort();
    requests.current.delete(key);
    files.current.delete(key);
    setItems(list => {
      const item = list.find(entry => entry.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter(entry => entry.key !== key);
    });
  }, []);

  /** Lets a failed picture be sent again on the next submit. */
  const retry = useCallback((key: string) => patch(key, { stage: 'waiting', progress: 0, error: undefined }), [patch]);

  /**
   * Called on submit: uploads every picture not yet uploaded (two at a time),
   * reports overall progress, and returns the server IDs in display order.
   * Pictures already uploaded on an earlier attempt are not sent twice.
   */
  const uploadAll = useCallback(async (onProgress: (done: number, total: number, percent: number) => void) => {
    const list = itemsRef.current;
    const pending = list.filter(item => item.stage !== 'uploaded');
    const bytes = new Map(pending.map(item => [item.key, files.current.get(item.key)?.size || 1]));
    const totalBytes = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
    const sent = new Map<string, number>();
    const ids = new Map(list.filter(item => item.mediaId && item.stage === 'uploaded').map(item => [item.key, item.mediaId!]));
    let done = list.length - pending.length;
    const report = () => onProgress(done, list.length, Math.round(([...sent.values()].reduce((a, b) => a + b, 0) / totalBytes) * 100));
    report();
    const failures: string[] = [];
    const queue = [...pending];
    async function next(): Promise<void> {
      const item = queue.shift();
      if (!item) return;
      const file = files.current.get(item.key);
      if (!file) { await next(); return; }
      patch(item.key, { stage: 'uploading', progress: 0, error: undefined });
      try {
        const id = await send(file, fraction => { sent.set(item.key, fraction * (bytes.get(item.key) || 1)); patch(item.key, { progress: Math.round(fraction * 100) }); report(); }, xhr => requests.current.set(item.key, xhr));
        ids.set(item.key, id); done += 1;
        sent.set(item.key, bytes.get(item.key) || 1);
        patch(item.key, { stage: 'uploaded', progress: 100, mediaId: id });
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          const message = cause instanceof Error ? cause.message : 'Upload failed.';
          failures.push(`${item.name}: ${message}`);
          patch(item.key, { stage: 'failed', error: message });
        }
      } finally { requests.current.delete(item.key); report(); }
      await next();
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, pending.length) }, next));
    if (failures.length) throw new Error(failures.length === 1 ? failures[0] : `${failures.length} pictures could not be uploaded. ${failures[0]}`);
    return itemsRef.current.flatMap(item => ids.get(item.key) ? [ids.get(item.key)!] : []);
  }, [patch]);

  useEffect(() => () => { for (const xhr of requests.current.values()) xhr.abort(); }, []);

  return { items, add, remove, retry, uploadAll };
}
