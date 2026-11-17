'use client';

import { useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import styles from './photo-gallery.module.css';

export function PhotoGallery({photos,title}:{photos:{src:string;thumbnail?:string}[];title:string}) {
  const [selected,setSelected]=useState(0);
  if(!photos.length)return null;
  const index=Math.min(selected,photos.length-1);
  const current=photos[index];
  function move(delta:number){setSelected((index+delta+photos.length)%photos.length);}
  return <section className={styles.gallery} aria-label="Ad pictures">
    <div className={styles.frame}>
      <div className={styles.backdrop} aria-hidden="true" style={{backgroundImage:`url(${JSON.stringify(current.src)})`}} />
      <img className={styles.image} src={current.src} alt={`${title} — picture ${index+1}`} decoding="async" />
      <span className={styles.count} aria-live="polite">{index+1} / {photos.length}</span>
      {photos.length>1&&<><button className={styles.previous} type="button" aria-label="Previous photo" onClick={()=>move(-1)}><FiChevronLeft /></button><button className={styles.next} type="button" aria-label="Next photo" onClick={()=>move(1)}><FiChevronRight /></button></>}
    </div>
    {photos.length>1&&<div className={styles.thumbnails} role="group" aria-label="Choose a picture">{photos.map((photo,item)=><button key={photo.src} type="button" aria-label={`Show picture ${item+1}`} aria-pressed={item===index} onClick={()=>setSelected(item)}><img src={photo.thumbnail||photo.src} alt="" loading="lazy" decoding="async" /></button>)}</div>}
  </section>;
}
