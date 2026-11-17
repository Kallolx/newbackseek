'use client';
import { useEffect,useMemo,useRef } from 'react';
import { FiImage,FiUploadCloud,FiX } from 'react-icons/fi';
import { toast } from '../../components/toast';
import styles from '../../member/member.module.css';
import { appendPictures } from './picture-selection';

export function AdminPicturePicker({files,onChange,existing=[],disabled=false}:{files:File[];onChange:(files:File[])=>void;existing?:string[];disabled?:boolean}) {
 const input=useRef<HTMLInputElement>(null);
 const previews=useMemo(()=>files.map(file=>({file,url:URL.createObjectURL(file)})),[files]);
 useEffect(()=>()=>previews.forEach(item=>URL.revokeObjectURL(item.url)),[previews]);
 const count=existing.length+files.length;
 function add(selected:File[]){
  if(disabled)return;
  const result=appendPictures(files,selected,existing.length);
  if(result.invalid)toast.error('Choose JPG, PNG or WebP pictures under 5 MB each.');
  if(result.overflow)toast.warning('You can add up to 6 pictures in total.');
  onChange(result.files);
 }
 return <section className={styles.section} aria-label="Add pictures"><h2><FiImage aria-hidden="true"/>Your pictures <span className={styles.help}>{count} / 6</span></h2>
  <div className={styles.upload} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();add(Array.from(event.dataTransfer.files));}}>
   <FiUploadCloud aria-hidden="true"/><strong>Add pictures to your ad</strong><p>Drop images here or choose files. JPG, PNG or WebP, up to 5 MB each.</p>
   <button className={styles.secondary} type="button" disabled={disabled||count>=6} onClick={()=>input.current?.click()}>Choose pictures</button>
   <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="Choose ad pictures" onChange={event=>{add(Array.from(event.currentTarget.files||[]));event.currentTarget.value='';}}/>
  </div>
  {count>0&&<div className={styles.photos}>{existing.map((url,index)=><div key={url}><img src={url} alt={'Saved picture '+(index+1)} width={200} height={160}/><span>Saved picture</span></div>)}{previews.map(({file,url},index)=><div key={url}><img src={url} alt={'Selected picture '+(index+1)} width={200} height={160}/>{existing.length===0&&index===0&&<span>Cover photo</span>}<button type="button" disabled={disabled} aria-label={'Remove '+file.name} onClick={()=>onChange(files.filter((_,i)=>i!==index))}><FiX/></button></div>)}</div>}
  <p className={styles.help}>Choose up to 6 pictures, together or one at a time. Upload starts only when you submit the ad.</p>
  {existing.length>0&&<p className={styles.help}>Manage saved pictures in Media.</p>}
 </section>;
}
