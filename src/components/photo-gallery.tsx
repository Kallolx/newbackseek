'use client';

import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiX } from 'react-icons/fi';
import styles from './photo-gallery.module.css';

type Photo = { src: string; thumbnail?: string };

function Thumbnails({ photos, index, onSelect, className }: { photos: Photo[]; index: number; onSelect: (item: number) => void; className: string }) {
  return <div className={className} role="group" aria-label="Choose a picture">
    {photos.map((photo, item) => <button key={photo.src} type="button" aria-label={`Show picture ${item + 1}`} aria-pressed={item === index} onClick={() => onSelect(item)}><img src={photo.thumbnail || photo.src} alt="" loading="lazy" decoding="async" /></button>)}
  </div>;
}

export function PhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [selected, setSelected] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<number | null>(null);
  const count = photos.length;
  const index = Math.min(selected, Math.max(0, count - 1));
  function move(delta: number) { setSelected(value => (Math.min(value, count - 1) + delta + count) % count); }

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
  const swipe = {
    onTouchStart: (event: TouchEvent) => { touchStart.current = event.touches[0]?.clientX ?? null; },
    onTouchEnd: (event: TouchEvent) => { const start = touchStart.current; touchStart.current = null; const end = event.changedTouches[0]?.clientX; if (start == null || end == null || count < 2) return; const distance = end - start; if (Math.abs(distance) > 40) move(distance < 0 ? 1 : -1); },
  };
  const arrows = (previous: string, next: string) => count > 1 && <><button className={previous} type="button" aria-label="Previous photo" onClick={event => { event.stopPropagation(); move(-1); }}><FiChevronLeft /></button><button className={next} type="button" aria-label="Next photo" onClick={event => { event.stopPropagation(); move(1); }}><FiChevronRight /></button></>;

  return <section className={styles.gallery} aria-label="Ad pictures">
    <div className={styles.frame} {...swipe}>
      <div className={styles.backdrop} aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(current.src)})` }} />
      <button className={styles.open} type="button" aria-label={`Open picture ${index + 1} full screen`} onClick={() => setViewerOpen(true)}>
        <img className={styles.image} src={current.src} alt={`${title} — picture ${index + 1}`} decoding="async" />
      </button>
      <span className={styles.count} aria-live="polite">{index + 1} / {count}</span>
      <span className={styles.expand} aria-hidden="true"><FiMaximize2 /></span>
      {arrows(styles.previous, styles.next)}
    </div>
    {count > 1 && <Thumbnails className={styles.thumbnails} photos={photos} index={index} onSelect={setSelected} />}
    {viewerOpen && <dialog ref={viewer} className={styles.viewer} aria-label={`${title} pictures`} onClose={() => setViewerOpen(false)} onClick={event => { if (event.target === event.currentTarget) viewer.current?.close(); }}>
      <div className={styles.viewerTop}>
        <span aria-live="polite">{index + 1} / {count}</span>
        <button className={styles.viewerClose} type="button" aria-label="Close full screen" onClick={() => viewer.current?.close()}><FiX /></button>
      </div>
      <div className={styles.viewerStage} {...swipe} onClick={event => { if (event.target === event.currentTarget) viewer.current?.close(); }}>
        <img className={styles.viewerImage} src={current.src} alt={`${title} — picture ${index + 1}`} decoding="async" />
        {arrows(styles.viewerPrevious, styles.viewerNext)}
      </div>
      {count > 1 && <Thumbnails className={`${styles.thumbnails} ${styles.viewerThumbnails}`} photos={photos} index={index} onSelect={setSelected} />}
    </dialog>}
  </section>;
}
