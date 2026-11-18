'use client';
import { useEffect, useSyncExternalStore } from 'react';
export type MemberPost={id:string;title:string;description:string;descriptionHtml?:string;age:number;location:string;phone:string;contactEmail?:string;mediaIds?:string[];cityName:string;cityHref:string;category:string;service:string;images:string[];coverImage?:string;thumbnails?:string[];status:'Published'|'Paused'|'Pending'|'Rejected';sample:false;createdAt:string};
export type MemberSession={id:string;email:string;username:string;emailVerified:boolean;verified?:boolean;posts:MemberPost[];actorId?:string;verificationStatus?:string;verificationRequested?:boolean};
// postsLoading is true only while the very first list of ads is loading. After that the account is
// refreshed quietly in the background: the screen keeps showing what it has (no skeleton flashes).
type Snapshot={member:MemberSession|null;ready:boolean;error:string;postsLoading:boolean;postsLoaded:boolean};
const server:Snapshot={member:null,ready:false,error:'',postsLoading:false,postsLoaded:false};
const FRESH_MS=60000;
let snapshot:Snapshot=server, generation=0, pending:Promise<void>|null=null, loadedAt=0;
const listeners=new Set<()=>void>();
function publish(value:Snapshot){snapshot=value;listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function image(variants:unknown,size:'card'|'full'|'thumb'='card'):string[]{if(!variants||typeof variants!=='object')return[];const v=variants as Record<string,{url?:string}>;const url=v[size]?.url||v.card?.url||v.full?.url;return url?[url]:[];}
export function refreshMember(force=false):Promise<void>{
 if(pending&&!force)return pending;
 // Screens ask on every mount; reuse what was loaded in the last minute instead of asking the server again.
 if(!force&&snapshot.member&&snapshot.postsLoaded&&!snapshot.error&&Date.now()-loadedAt<FRESH_MS)return Promise.resolve();
 const version=++generation;
 const job=(async()=>{try{
  const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){if(version===generation){loadedAt=0;publish({member:null,ready:true,error:'',postsLoading:false,postsLoaded:false});}return;}
  if(!response.ok)throw new Error('Unable to load your account. Please retry.');
  const {user}=await response.json();
  // Publish the identity immediately, without waiting for the ads request.
  const previous=snapshot.member;
  const sameUser=Boolean(previous&&previous.id===user.id&&snapshot.postsLoaded);
  if(version===generation)publish({member:{id:user.id,email:user.email,username:user.username,emailVerified:Boolean(user.email_verified_at),verified:Boolean(user.verified),actorId:user.actor_id,verificationStatus:user.verification_status,posts:sameUser?previous!.posts:[]},ready:true,error:'',postsLoading:!sameUser,postsLoaded:sameUser});
  const ads=await fetch('/api/account/ads',{credentials:'same-origin',cache:'no-store'});
  if(!ads.ok)throw new Error('Unable to load your ads. Please retry.');
  const body=await ads.json();
  const posts:MemberPost[]=body.posts.map((post:Record<string,unknown>)=>{
    const pictures=Array.isArray(post.images)&&post.images.length?post.images:[post.image];
    return {id:String(post.id),title:String(post.title),description:String(post.description),age:Number(post.age||0),location:String(post.location||''),phone:String(post.phone||''),contactEmail:String(post.contact_email||''),mediaIds:Array.isArray(post.media_ids)?post.media_ids.map(String):[],cityName:String(post.city_name||''),cityHref:String(post.city_href||''),category:String(post.category_slug),service:String(post.category_slug),images:pictures.flatMap(value=>image(value,'full')),coverImage:image(post.image)[0]||pictures.flatMap(value=>image(value))[0],thumbnails:pictures.flatMap(value=>image(value,'thumb')),status:post.status==='published'?'Published':post.status==='paused'?'Paused':post.status==='rejected'?'Rejected':'Pending',sample:false,createdAt:String(post.created_at)};
  });
  if(version===generation&&snapshot.member){loadedAt=Date.now();publish({...snapshot,member:{...snapshot.member,posts},postsLoading:false,postsLoaded:true});}
 }catch(cause){if(version===generation){
  // A failed background refresh keeps the screen as it is; only a first load shows the error.
  if(snapshot.member&&snapshot.postsLoaded)publish({...snapshot,postsLoading:false});
  else publish({...snapshot,ready:true,postsLoading:false,error:cause instanceof Error?cause.message:'Unable to load your account.'});}}
 finally{if(version===generation)pending=null;}})(); pending=job;return job;
}
if(typeof window!=='undefined')window.addEventListener('bpn-session-change',()=>{void refreshMember(true);});
export function useMember(){const state=useSyncExternalStore(subscribe,()=>snapshot,()=>server);useEffect(()=>{void refreshMember();},[]);return {...state,refresh:()=>refreshMember(true)};}
export async function logOut(){
 const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
 if(!response.ok)throw new Error('Unable to log out. Please try again.');
 generation++;pending=null;loadedAt=0;publish({member:null,ready:true,error:'',postsLoading:false,postsLoaded:false});
}
