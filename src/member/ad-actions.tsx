'use client';
import Link from 'next/link';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiEdit2,FiPause,FiSend,FiTrash2 } from 'react-icons/fi';
import { toast } from '../components/toast';
import styles from './member.module.css';

export function AdActions({id,status,onChange}:{id:string;status:string;onChange:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [busy,setBusy]=useState(false);const router=useRouter();
 async function action(kind:'delete'|'paused'|'pending'){
  setBusy(true);try{const response=await fetch(`/api/account/ads/${id}`+(kind==='delete'?'':'/status'),{method:kind==='delete'?'DELETE':'POST',headers:kind==='delete'?undefined:{'content-type':'application/json'},body:kind==='delete'?undefined:JSON.stringify({status:kind})});const result=await response.json();if(!response.ok)throw Error(result.error||'The ad could not be updated.');window.dispatchEvent(new Event('bpn-session-change'));dialog.current?.close();toast.success(kind==='delete'?'Ad deleted.':kind==='paused'?'Ad paused.':'Ad submitted for review.');if(kind==='delete')router.replace('/myaccount');else onChange();}catch(error){toast.error(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}
 }
 return <><div className={styles.ownerActions} aria-label="Manage your ad"><span className={styles.postStatus}>{status[0]?.toUpperCase()+status.slice(1)}</span><Link className={styles.secondary} href={`/myaccount/posts/${id}/edit`}><FiEdit2/> Edit ad</Link>{status==='published'&&<button className={styles.secondary} disabled={busy} onClick={()=>void action('paused')}><FiPause/> Pause</button>}{['paused','rejected','draft'].includes(status)&&<button className={styles.secondary} disabled={busy} onClick={()=>void action('pending')}><FiSend/> Submit for review</button>}<button className={styles.danger} disabled={busy} onClick={()=>dialog.current?.showModal()}><FiTrash2/> Delete</button></div>
 <dialog ref={dialog} className={styles.confirmDialog}><h2>Delete this ad?</h2><p>It will be removed from your ads and all public city listings.</p><div className={styles.ownerActions}><button className={styles.secondary} disabled={busy} onClick={()=>dialog.current?.close()}>Keep ad</button><button className={styles.danger} disabled={busy} onClick={()=>void action('delete')}>{busy?'Deleting…':'Delete ad'}</button></div></dialog></>;
}
