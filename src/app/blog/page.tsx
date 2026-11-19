import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/seo';
import Link from 'next/link';
import { blogDate, blogPosts } from '../../content/blog';

export async function generateMetadata(): Promise<Metadata> { return pageMetadata({ path: '/blog', kind: 'page', title: 'Blog – Tips for Posting & Staying Safe | BackpageNew', description: 'Tips for writing a good ad, spotting scams, staying safe when you meet someone and using your BackpageNew wallet.' }); }

export default function BlogPage() {
  const [featured, ...rest] = [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));
  return <main id="main" className="blog-page shell">
    <header className="blog-head"><p className="legal-kicker">BackpageNew</p><h1>Blog</h1></header>
    <Link href={'/blog/' + featured.slug} className="blog-featured">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={featured.image + '&w=1200&h=640'} alt={featured.imageAlt} width={1200} height={640} />
      <div><span className="blog-tag">{featured.tag}</span><h2>{featured.title}</h2><p>{featured.excerpt}</p><small>{blogDate(featured.date)} · {featured.minutes} min read</small></div>
    </Link>
    <ul className="blog-grid">{rest.map((post) => <li key={post.slug}><Link href={'/blog/' + post.slug} className="blog-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.image + '&w=640&h=400'} alt={post.imageAlt} width={640} height={400} loading="lazy" />
      <div><span className="blog-tag">{post.tag}</span><h2>{post.title}</h2><p>{post.excerpt}</p><small>{blogDate(post.date)} · {post.minutes} min read</small></div>
    </Link></li>)}</ul>
  </main>;
}
