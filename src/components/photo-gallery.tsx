'use client';

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiX } from 'react-icons/fi';
import styles from './photo-gallery.module.css';

type Photo = { src: string; thumbnail?: string; /** Medium size shown first while the large one downloads. */ preview?: string };

function Thumbnails({ photos, index, onSelect, className }: { photos: Photo[]; index: number; onSelect: (item: number) => void; className: string }) {
  return <div className={className} role="group" aria-label="Choose a picture">
    {photos.map((photo, item) => <button key={photo.src} type="button" aria-label={`Show picture ${item + 1}`} aria-pressed={item === index} onClick={() => onSelect(item)}><img src={photo.thumbnail || photo.src} alt="" decoding="async" fetchPriority="low" /></button>)}
  </div>;
}

export function PhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [selected, setSelected] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Full pictures the browser already has, and the picture we are waiting for after a tap.
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  // The first picture also starts as "waiting": the medium preview shows until the large one is in.
  const [waitingFor, setWaitingFor] = useState(photos[0]?.src ?? '');
  const loadedRef = useRef(loaded);
  const indexRef = useRef(0);
  const warmed = useRef(new Map<string, HTMLImageElement>());
  const [previewShown, setPreviewShown] = useState('');
  const viewer = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<number | null>(null);
  const count = photos.length;
  const index = Math.min(selected, Math.max(0, count - 1));
  useEffect(() => { loadedRef.current = loaded; indexRef.current = index; });
  const sources = photos.map(photo => photo.src).join('|');

  const markLoaded = useCallback((src: string) => {
    setLoaded(previous => previous.has(src) ? previous : new Set(previous).add(src));
    setWaitingFor(current => current === src ? '' : current);
  }, []);

  /** Switch pictures; if the new one is not downloaded yet, show a blurred preview while it arrives. */
  function go(target: number) {
    const next = (target + count) % count;
    const src = photos[next]?.src;
    if (src && !loadedRef.current.has(src)) setWaitingFor(src);
    setSelected(next);
  }
  function move(delta: number) { go(indexRef.current + delta); }

  // As soon as the current picture shows (even just its medium preview), fetch the small
  // preview of the next one, so an immediate tap on the arrow shows something at once.
  useEffect(() => {
    if (!previewShown) return;
    const list = photos;
    const at = list.findIndex(photo => photo.src === previewShown);
    if (at < 0 || list.length < 2) return;
    for (const target of [at + 1]) {
      const preview = list[(target + list.length) % list.length].preview;
      if (!preview || warmed.current.has(preview)) continue;
      const image = new Image() as HTMLImageElement & { fetchPriority?: string };
      image.decoding = 'async'; image.fetchPriority = 'low'; image.src = preview;
      warmed.current.set(preview, image);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewShown, sources]);

  // Once the shown picture is in, quietly download the next and previous ones, then the rest,
  // so a tap on an arrow is instant.
  useEffect(() => {
    const list = sources ? sources.split('|') : [];
    if (list.length < 2 || !loaded.has(list[Math.min(index, list.length - 1)])) return;
    const order: number[] = [];
    for (let step = 1; step < list.length; step += 1) for (const target of [index + step, index - step]) { const wrapped = (target + list.length) % list.length; if (wrapped !== index && !order.includes(wrapped)) order.push(wrapped); }
    const timers = order.map((target, position) => window.setTimeout(() => {
      const src = list[target];
      if (warmed.current.has(src)) return;
      const image = new Image() as HTMLImageElement & { fetchPriority?: string };
      image.decoding = 'async'; image.fetchPriority = 'low'; image.src = src;
      warmed.current.set(src, image);
      image.decode().then(() => markLoaded(src)).catch(() => {});
    }, position < 2 ? 0 : 400 * (position - 1)));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [sources, index, loaded, markLoaded]);

  useEffect(() => {
    if (!viewerOpen) return;
    viewer.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') move(-1); else if (event.key === 'ArrowRight') move(1); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen, count]);

  if (!count) return null;
  const current = photos[index];
  const waiting = waitingFor === current.src;
  const swipe = {
    onTouchStart: (event: TouchEvent) => { touchStart.current = event.touches[0]?.clientX ?? null; },
    onTouchEnd: (event: TouchEvent) => { const start = touchStart.current; touchStart.current = null; const end = event.changedTouches[0]?.clientX; if (start == null || end == null || count < 2) return; const distance = end - start; if (Math.abs(distance) > 40) move(distance < 0 ? 1 : -1); },
  };
  const arrows = (previous: string, next: string) => count > 1 && <><button className={previous} type="button" aria-label="Previous photo" onClick={event => { event.stopPropagation(); move(-1); }}><FiChevronLeft /></button><button className={next} type="button" aria-label="Next photo" onClick={event => { event.stopPropagation(); move(1); }}><FiChevronRight /></button></>;

  return <section className={styles.gallery} aria-label="Ad pictures">
    <div className={styles.frame} {...swipe}>
      <div className={styles.backdrop} aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(current.thumbnail || current.src)})` }} />
      {waiting && <img className={styles.placeholder} data-sharp={current.preview ? true : undefined} src={current.preview || current.thumbnail || current.src} alt="" aria-hidden="true" fetchPriority={index === 0 ? 'high' : 'auto'} onLoad={() => setPreviewShown(current.src)} ref={element => { if (element?.complete && element.naturalWidth) setPreviewShown(current.src); }} />}
      {waiting && !current.preview && <span className={styles.spinner} role="status" aria-label="Loading picture" />}
      <button className={styles.open} type="button" aria-label={`Open picture ${index + 1} full screen`} onClick={() => setViewerOpen(true)}>
        <img key={current.src} ref={element => { if (element?.complete && element.naturalWidth) markLoaded(current.src); }} onLoad={() => markLoaded(current.src)} className={styles.image} data-waiting={waiting || undefined} src={current.src} alt={`${title} — picture ${index + 1}`} decoding="async" loading="eager" fetchPriority={index === 0 ? 'high' : 'auto'} />
      </button>
      <span className={styles.count} aria-live="polite">{index + 1} / {count}</span>
      <span className={styles.expand} aria-hidden="true"><FiMaximize2 /></span>
      {arrows(styles.previous, styles.next)}
    </div>
    {count > 1 && <Thumbnails className={styles.thumbnails} photos={photos} index={index} onSelect={go} />}
    {viewerOpen && <dialog ref={viewer} className={styles.viewer} aria-label={`${title} pictures`} onClose={() => setViewerOpen(false)} onClick={event => { if (event.target === event.currentTarget) viewer.current?.close(); }}>
      <div className={styles.viewerTop}>
        <span aria-live="polite">{index + 1} / {count}</span>
        <button className={styles.viewerClose} type="button" aria-label="Close full screen" onClick={() => viewer.current?.close()}><FiX /></button>
      </div>
      <div className={styles.viewerStage} {...swipe} onClick={event => { if (event.target === event.currentTarget) viewer.current?.close(); }}>
        <img className={styles.viewerImage} src={current.src} alt={`${title} — picture ${index + 1}`} decoding="async" />
        {arrows(styles.viewerPrevious, styles.viewerNext)}
      </div>
      {count > 1 && <Thumbnails className={`${styles.thumbnails} ${styles.viewerThumbnails}`} photos={photos} index={index} onSelect={go} />}
    </dialog>}
  </section>;
}
