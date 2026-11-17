'use client';
import { useEffect, useSyncExternalStore } from 'react';
export type MemberPost={id:string;title:string;description:string;descriptionHtml?:string;age:number;location:string;phone:string;cityName:string;cityHref:string;category:string;service:string;images:string[];status:'Published'|'Paused'|'Pending'|'Rejected';sample:false;createdAt:string};
export type MemberSession={id:string;email:string;username:string;emailVerified:boolean;posts:MemberPost[];actorId?:string;verificationStatus?:string;verificationRequested?:boolean};
type Snapshot={member:MemberSession|null;ready:boolean;error:string;postsLoading:boolean};
const server:Snapshot={member:null,ready:false,error:'',postsLoading:false};
let snapshot:Snapshot=server, generation=0, pending:Promise<void>|null=null;
const listeners=new Set<()=>void>();
function publish(value:Snapshot){snapshot=value;listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function image(variants:unknown):string[]{if(!variants||typeof variants!=='object')return[];const v=variants as Record<string,{url?:string}>;return v.card?.url?[v.card.url]:[];}
export function refreshMember(force=false):Promise<void>{
 if(pending&&!force)return pending;
 const version=++generation;
 const job=(async()=>{try{
  const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){if(version===generation)publish({member:null,ready:true,error:'',postsLoading:false});return;}
  if(!response.ok)throw new Error('Unable to load your account. Please retry.');
  const {user}=await response.json();
  // Publish the identity immediately, without waiting for the ads request.
  const previous=snapshot.member;
  if(version===generation)publish({member:{id:user.id,email:user.email,username:user.username,emailVerified:Boolean(user.email_verified_at),actorId:user.actor_id,verificationStatus:user.verification_status,posts:previous&&previous.id===user.id?previous.posts:[]},ready:true,error:'',postsLoading:true});
  const ads=await fetch('/api/account/ads',{credentials:'same-origin',cache:'no-store'});
  if(!ads.ok)throw new Error('Unable to load your ads. Please retry.');
  const body=await ads.json();
  const posts:MemberPost[]=body.posts.map((post:Record<string,unknown>)=>({id:String(post.id),title:String(post.title),description:String(post.description),age:Number(post.age||0),location:String(post.location||''),phone:String(post.phone||''),cityName:String(post.city_name||''),cityHref:String(post.city_href||''),category:String(post.category_slug),service:String(post.category_slug),images:image(post.image),status:post.status==='published'?'Published':post.status==='paused'?'Paused':post.status==='rejected'?'Rejected':'Pending',sample:false,createdAt:String(post.created_at)}));
  if(version===generation&&snapshot.member)publish({...snapshot,member:{...snapshot.member,posts},postsLoading:false});
 }catch(cause){if(version===generation)publish({...snapshot,ready:true,postsLoading:false,error:cause instanceof Error?cause.message:'Unable to load your account.'});}
 finally{if(version===generation)pending=null;}})(); pending=job;return job;
}
if(typeof window!=='undefined')window.addEventListener('bpn-session-change',()=>{void refreshMember(true);});
export function useMember(){const state=useSyncExternalStore(subscribe,()=>snapshot,()=>server);useEffect(()=>{void refreshMember();},[]);return {...state,refresh:()=>refreshMember(true)};}
export async function logOut(){
 const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
 if(!response.ok)throw new Error('Unable to log out. Please try again.');
 generation++;pending=null;publish({member:null,ready:true,error:'',postsLoading:false});
}
