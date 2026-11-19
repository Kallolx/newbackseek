import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { blogDate, blogPost, blogPosts } from '../../../content/blog';
import { JsonLd } from '../../../components/json-ld';
import { articleLd, breadcrumbLd, getSeo, pageMetadata } from '../../../lib/seo';

export const dynamicParams = false;
export function generateStaticParams() { return blogPosts.map((post) => ({ slug: post.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = blogPost((await params).slug);
  if (!post) return {};
  return pageMetadata({ path: '/blog/' + post.slug, kind: 'blog', vars: { title: post.title, excerpt: post.excerpt }, image: post.image + '&w=1200&h=630', type: 'article', published: post.date + 'T12:00:00Z', modified: post.date + 'T12:00:00Z' });
}

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const post = blogPost((await params).slug);
  if (!post) notFound();
  const { settings } = await getSeo();
  const more = blogPosts.filter((item) => item.slug !== post.slug).slice(0, 3);
  return <main id="main" className="blog-article">
    <article className="legal-content">
      <JsonLd data={[settings.schema.blog && articleLd({ title: post.title, description: post.excerpt, path: '/blog/' + post.slug, image: post.image + '&w=1200&h=630', published: post.date, settings }), settings.schema.breadcrumbs && breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }, { name: post.title, path: '/blog/' + post.slug }])]} />
      <Link href="/blog" className="blog-back">← Blog</Link>
      <span className="blog-tag">{post.tag}</span>
      <h1>{post.title}</h1>
      <p className="legal-date">{blogDate(post.date)} · {post.minutes} min read</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="blog-hero" src={post.image + '&w=1400&h=760'} alt={post.imageAlt} width={1400} height={760} fetchPriority="high" />
      <div className="blog-body">{post.body.map((block, index) => <section key={index}>
        {block.heading && <h2>{block.heading}</h2>}
        {block.paragraphs?.map((text) => <p key={text}>{text}</p>)}
        {block.list && <ul>{block.list.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>)}</div>
    </article>
    <section className="blog-more shell" aria-labelledby="more-title"><h2 id="more-title">More from the blog</h2>
      <ul className="blog-grid">{more.map((item) => <li key={item.slug}><Link href={'/blog/' + item.slug} className="blog-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image + '&w=640&h=400'} alt={item.imageAlt} width={640} height={400} loading="lazy" />
        <div><span className="blog-tag">{item.tag}</span><h2>{item.title}</h2><small>{blogDate(item.date)} · {item.minutes} min read</small></div>
      </Link></li>)}</ul>
    </section>
  </main>;
}
