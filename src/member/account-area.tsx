'use client';

import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FiGrid, FiList, FiArrowLeft } from 'react-icons/fi';
import { EmptyState, PageLoader } from '../components/page-state';
import { Verification } from './verification';
import { PostCard } from '../components/post-card';
import { PostPagination } from '../components/post-pagination';
import { SiteSelect } from '../components/site-select';
import { useMember, saveMember, type MemberSession } from './session';
import styles from './member.module.css';
import { DescriptionEditor } from './description-editor';

const MemberPostForm = dynamic(() => import('./post-form').then((module) => module.MemberPostForm), {
  loading: () => <PageLoader label="Preparing your posting form" />,
});

export function AccountArea({ section }: { section: string[] }) {
  const { member, ready } = useMember();
  const router = useRouter();
  useEffect(() => { if (ready && !member) router.replace('/auth'); }, [ready, member, router]);
  if (!ready || !member) return <main id="main" className={'shell ' + styles.page}><PageLoader label={ready ? 'Taking you to sign in' : 'Opening your account'} /></main>;
  const current = section[0] ?? '';
  return (
    <main id="main" className={'shell ' + styles.page}>
      <nav className={styles.menu} aria-label="Account menu">
        {[['post', 'Post an Ad'], ['verification', 'Verification'], ['settings', 'Account Settings']].map(([path, label]) => (
          <span key={path}>[ <Link href={'/myaccount/' + path} aria-current={current === path ? 'page' : undefined}>{label}</Link> ]</span>
        ))}
      </nav>
      {current === '' && <MemberPosts member={member} />}
      {current === 'post' && <MemberPostForm member={member} />}
      {current === 'settings' && <Settings member={member} />}
      {current === 'verification' && <Verification member={member} />}
      {current === 'posts' && <MemberDetails member={member} id={section[1]} />}
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
    <div className={styles.heading}><div><h1>My ads</h1><p>{member.posts.length} ads · Your posts and sample listings</p></div><Link className={styles.primary} href="/myaccount/post">Post an Ad</Link></div>
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
        thumbnail={post.images[0] ? <Image src={post.images[0]} alt="" width={320} height={220} unoptimized={post.images[0].startsWith('data:')} /> : undefined}
        details={<><span>Age: {post.age} · {post.cityName}</span><span className={styles.postStatus} data-paused={post.status === 'Paused'}>{post.sample ? 'Sample · ' : ''}{post.status}</span></>} />)}
    </ul> : query ? <EmptyState kind="search" title="No matching ads" description="Try a shorter search or clear your search to see all your ads." action="Clear search" onAction={() => { setQuery(''); setPage(1); }} /> : <EmptyState title="Your first ad starts here" description="Once you publish an ad, you can find it here, view its pictures and manage its status." href="/myaccount/post" action="Create your first ad" />}
    {matches.length > 0 && <PostPagination page={currentPage} total={total} onChange={(value) => { setPage(value); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
  </>;
}

function MemberDetails({ member, id }: { member: MemberSession; id: string }) {
  const post = member.posts.find((item) => item.id === id);
  const [image, setImage] = useState(0);
  const [message, setMessage] = useState('');
  if (!post) return <EmptyState title="We couldn’t find this ad" description="It may have been removed or is no longer available in your account. Your other ads are still waiting for you." href="/myaccount" action="Back to my ads" />;
  function toggle() {
    try { saveMember({ ...member, posts: member.posts.map((item) => item.id === id ? { ...item, status: item.status === 'Published' ? 'Paused' : 'Published' } : item) }); setMessage('Ad status updated in this preview.'); }
    catch { setMessage('Your browser could not save this change.'); }
  }
  return <article className={styles.detail}>
    <Link className={styles.back} href="/myaccount"><FiArrowLeft aria-hidden="true" /> My ads</Link>
    <h1>{post.title}</h1><p>{post.cityName} › {post.category} › <strong>{post.service}</strong></p>
    <div className={styles.heading}><span className={styles.postStatus}>{post.sample ? 'Sample · ' : ''}{post.status}</span><button className={styles.secondary} onClick={toggle}>{post.status === 'Published' ? 'Pause ad' : 'Restore ad'}</button></div>
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {!post.images.length && <EmptyState kind="photo" compact title="No pictures in this ad" description="This ad was posted without photos. Its details are available below." />}
    {!!post.images.length && <><div className={styles.mainPhoto}><Image src={post.images[image]} alt={post.title} width={1000} height={700} unoptimized={post.images[image].startsWith('data:')} /></div>
      {post.images.length > 1 && <div className={styles.thumbnails}>{post.images.map((src, index) => <button key={index} type="button" aria-label={'Show photo ' + (index + 1)} aria-pressed={index === image} onClick={() => setImage(index)}><Image src={src} alt="" width={90} height={70} unoptimized={src.startsWith('data:')} /></button>)}</div>}</>}
    <dl className={styles.facts}><div><dt>Age</dt><dd>{post.age}</dd></div><div><dt>Location</dt><dd>{post.location}</dd></div><div><dt>Phone</dt><dd>{post.phone}</dd></div><div><dt>Email</dt><dd>{member.email}</dd></div></dl>
    {post.descriptionHtml ? <DescriptionEditor content={post.descriptionHtml} readOnly /> : <p className={styles.description}>{post.description}</p>}
    <p className={styles.muted}>{post.sample ? 'This is a sample listing.' : 'This ad is saved locally in your preview account. It has not been published to the public website.'}</p>
  </article>;
}

function Settings({ member }: { member: MemberSession }) {
  const [gender, setGender] = useState(member.gender);
  const [message, setMessage] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try { saveMember({ ...member, username: String(data.get('username')).trim(), email: String(data.get('email')).trim(), gender }); setMessage('Your account details have been saved in this tab.'); }
    catch { setMessage('Your browser could not save the changes.'); }
  }
  return <section className={styles.formWidth}><h1>Account settings</h1><p className={styles.intro}>Manage your profile and contact details.</p>
    <form className={styles.form} onSubmit={submit}>
      <label>Username<input name="username" required pattern="[A-Za-z0-9]+" defaultValue={member.username.replace(/[^a-z0-9]/gi, '')} autoComplete="username" maxLength={40} /></label>
      <label>Email<input name="email" type="email" required defaultValue={member.email} autoComplete="email" /></label>
      <SiteSelect label="Gender" value={gender} onChange={setGender} options={['Woman', 'Man', 'Nonbinary', 'Another identity', 'Prefer not to say'].map((label) => ({ value: label, label }))} />
      <p className={styles.notice}>Password changes and email verification will be available when account services are connected. Preview sign-in does not save your password.</p>
      <button className={styles.primary} type="submit">Save changes</button>{message && <p role="status">{message}</p>}
    </form>
  </section>;
}

