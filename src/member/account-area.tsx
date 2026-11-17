'use client';

import { FeedbackToast } from '../components/toast';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FiGrid, FiList } from 'react-icons/fi';
import { EmptyState, PageLoader } from '../components/page-state';
import { Verification } from './verification';
import { PostCard } from '../components/post-card';
import { PostPagination } from '../components/post-pagination';
import { useMember, type MemberSession } from './session';
import styles from './member.module.css';
import { PostDetail } from '../components/post-detail';
import { countries } from '../directory/areas';
import { serviceGroups } from '../directory/service-groups';

const MemberPostForm = dynamic(() => import('./post-form').then((module) => module.MemberPostForm), {
  loading: () => <PageLoader label="Loading the posting form" />,
});

export function AccountArea({ section }: { section: string[] }) {
  const { member, ready, error, postsLoading, refresh } = useMember();
  const router = useRouter();
  useEffect(() => { if (ready && !member && !error) router.replace('/auth'); }, [ready, member, error, router]);
  if (error) return <main id="main" className={'shell ' + styles.page}><EmptyState title="Account could not load" description={error} action="Retry" onAction={()=>void refresh()}/></main>;
  if (!ready || !member) return <main id="main" className={'shell ' + styles.page}><PageLoader label="Loading your account"/></main>;
  const current = section[0] ?? '';
  return (
    <main id="main" className={'shell ' + styles.page}>
      <nav className={styles.menu} aria-label="Account menu">
        {[['post', 'Post an Ad'], ['verification', 'Verification'], ['settings', 'Account Settings']].map(([path, label]) => (
          <span key={path}>[ <Link href={'/myaccount/' + path} aria-current={current === path ? 'page' : undefined}>{label}</Link> ]</span>
        ))}
      </nav>
      {member.actorId && <p className={styles.notice}>Support session for @{member.username}. <button type="button" onClick={async()=>{await fetch('/api/account/impersonation/stop',{method:'POST'});window.location.replace('/auth');}}>End support session</button></p>}
      {!member.emailVerified && <p className={styles.notice}>Your email is not verified. Check your inbox or <Link href="/myaccount/settings">resend the verification email</Link> before posting.</p>}
      {current === '' && (postsLoading ? <PageLoader label="Loading your ads"/> : <MemberPosts member={member} />)}
      {current === 'post' && <MemberPostForm member={member} />}
      {current === 'settings' && <Settings member={member} />}
      {current === 'verification' && <Verification member={member} />}
      {current === 'posts' && <MemberDetails member={member} id={section[1]} editing={section[2]==='edit'} />}
    </main>
  );
}

function MemberPosts({ member }: { member: MemberSession }) {
  const [gallery, setGallery] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const matches = member.posts.filter((post) => (post.title + ' ' + post.cityName + ' ' + post.service).toLowerCase().includes(query.toLowerCase()));
  const total = Math.max(1, Math.ceil(matches.length / 10));
  const currentPage = Math.min(page, total);
  return <>
    <div className={styles.heading}><div><h1>My ads</h1><p>{member.posts.length} ads · Your listings and their status</p></div><Link className={styles.primary} href="/myaccount/post">Post an Ad</Link></div>
    <div className={styles.toolbar}>
      <input type="search" aria-label="Search your ads" placeholder="Search your ads…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      <div className="listing-views" role="group" aria-label="Post layout">
        <button type="button" aria-pressed={!gallery} onClick={() => setGallery(false)}><FiList aria-hidden="true" /> List</button>
        <button type="button" aria-pressed={gallery} onClick={() => setGallery(true)}><FiGrid aria-hidden="true" /> Gallery</button>
      </div>
    </div>
    {matches.length ? <ul className={gallery ? 'post-list post-gallery' : 'post-list'}>
      {matches.slice((currentPage - 1) * 10, currentPage * 10).map((post) => <PostCard key={post.id}
        title={post.title} label={post.location} description={post.description}
        href={'/myaccount/posts/' + post.id}
        thumbnail={post.images[0] ? <Image src={post.coverImage||post.images[0]} alt="" width={320} height={220} unoptimized /> : undefined}
        details={<><span>Age: {post.age} · {post.cityName}</span><span className={styles.postStatus} data-paused={post.status === 'Paused'}>{post.status}</span></>} />)}
    </ul> : query ? <EmptyState kind="search" title="No matching ads" description="Try a shorter search or clear your search to see all your ads." action="Clear search" onAction={() => { setQuery(''); setPage(1); }} /> : <EmptyState title="Your first ad starts here" description="Once you publish an ad, you can find it here, view its pictures and manage its status." href="/myaccount/post" action="Create your first ad" />}
    {matches.length > 0 && <PostPagination page={currentPage} total={total} onChange={(value) => { setPage(value); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
  </>;
}

function MemberDetails({ member, id,editing }: { member: MemberSession; id: string;editing:boolean }) {
  const post = member.posts.find((item) => item.id === id);
  if (!post) return <EmptyState title="We couldn’t find this ad" description="It may have been removed or is no longer available in your account. Your other ads are still waiting for you." href="/myaccount" action="Back to my ads" />;
  if(editing)return <MemberPostForm key={post.id} member={member} post={post} />;
  const place=countries.flatMap(country=>country.regions.flatMap(region=>region.cities.map(city=>({city,region})))).find(place=>place.city.href===post.cityHref);
  const service=serviceGroups.flatMap(group=>group.services).find(service=>service.slug===post.service)||{name:post.service,slug:post.service};
  return <PostDetail account postId={id} city={place?.city||{name:post.cityName,href:post.cityHref}} region={place?.region||{name:post.cityName,href:post.cityHref}} service={service} />;
}

function Settings({ member }: { member: MemberSession }) {
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'same-origin' });
    setMessage(response.ok ? 'A new verification email has been sent.' : 'We could not send the verification email. Please try again.');
  }
  return <section className={styles.formWidth}><h1>Account settings</h1><p className={styles.intro}>Your account is protected with a secure server session.</p>
    <form className={styles.form} onSubmit={submit}>
      <label>Username<input value={member.username} readOnly /></label>
      <label>Email<input type="email" value={member.email} readOnly /></label>
      <p className={styles.notice}>{member.emailVerified ? 'Your email address is verified.' : 'Verify your email before publishing ads or uploading pictures.'}</p>
      {!member.emailVerified && <button className={styles.primary} type="submit">Resend verification email</button>}<FeedbackToast message={message} type="info" />
    </form>
  </section>;
}

