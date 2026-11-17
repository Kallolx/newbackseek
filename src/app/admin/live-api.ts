'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '../../components/toast';
export async function adminApi<T = {ok:boolean}>(path:string, options:RequestInit = {}):Promise<T> {
 const response = await fetch('/api' + path, { ...options, credentials:'same-origin',cache:'no-store',headers:{...(options.body?{'content-type':'application/json'}:{}),...options.headers} });
 const result=await response.json().catch(()=>({}));
 if(!response.ok) { if(response.status===401) window.location.replace('/login'); throw new Error(result.error || 'The request could not be completed. Please try again.'); }
 return result as T;
}
export function useAdminResource<T>(path:string) {
 const [data,setData]=useState<T>(); const [loading,setLoading]=useState(true);const [error,setError]=useState(''); const [revision,setRevision]=useState(0);const [resolvedPath,setResolvedPath]=useState('');
 const reload=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
 adminApi<T>(path,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(cause=>{if(cause.name!=='AbortError'){setError(cause.message);toast.error(cause.message);}}).finally(()=>{if(!controller.signal.aborted){setLoading(false);setResolvedPath(path);}});
 return()=>controller.abort();},[path,revision]);
 return {data:resolvedPath===path?data:undefined,loading:loading||resolvedPath!==path,error,reload};
}
