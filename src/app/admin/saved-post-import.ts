import { readSavedArchive } from './saved-post-archive';

export type SiteRule = { domain: string; name: string; selectors: { title: string; description: string; images: string; age: string; location: string; phone: string; email: string } };
export type UntrainedPage = { file: File; domain: string; sourceUrl: string };

const builtInRules: SiteRule[] = [
  { domain: 'callescort.org', name: 'CallEscort', selectors: { title: 'meta[name="description"]', description: 'meta[name="description"]', images: '.fotorama__stage__frame img', age: '', location: '.product-info .product-info-list a[title^="browse all escort in"]', phone: '.product-info a[href^="tel:"]', email: '' } },
  { domain: 'myescort.network', name: 'MyEscort', selectors: { title: '.ad-details h1[itemprop="disambiguatingDescription"]', description: '.ad-details tr.description td', images: '#photo-gallery img', age: 'meta[name="description"]', location: 'meta[itemprop="address"]', phone: 'meta[itemprop="telephone"]', email: '' } },
];

export function domainFor(source: URL): string {
  const parts = source.hostname.toLowerCase().split('.');
  const compound = new Set(['co.uk', 'org.uk', 'com.au', 'net.au', 'co.nz', 'co.in', 'com.bd', 'com.br', 'com.mx']);
  const length = compound.has(parts.slice(-2).join('.')) ? 3 : 2;
  return parts.length > length ? parts.slice(-length).join('.') : source.hostname.toLowerCase();
}

function findRule(source: URL, rules: SiteRule[]) {
  const hostname = source.hostname.toLowerCase();
  return [...rules, ...builtInRules].find(rule => hostname === rule.domain || hostname.endsWith(`.${rule.domain}`));
}

export type ImportedPost = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  description: string;
  age?: number;
  location: string;
  phone: string;
  email: string;
  pictures: File[];
  warnings: string[];
  owner: string;
  category: string;
  targets: string[];
  posted: boolean;
};

export function textWithLines(element: Element | null): string {
  if (!element) return '';
  if (element.tagName === 'META') return element.getAttribute('content')?.trim() || '';
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent || ''); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (['script', 'style', 'template', 'noscript'].includes(tag)) return;
    if (tag === 'br') { parts.push('\n'); return; }
    for (const child of node.childNodes) visit(child);
    if (['p', 'div', 'li'].includes(tag)) parts.push('\n');
  };
  visit(element);
  return parts.join('').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizedPath(value: string): string {
  let path = value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\//, '');
  try { path = decodeURIComponent(path); } catch { /* Keep the original path. */ }
  return path;
}

function mediaType(file: File): string | null {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : null;
}

function savedSource(markup: string): URL | null {
  const match = markup.match(/saved from url=\(\d+\)(https?:\/\/[^\s>]+)/i);
  if (!match) return null;
  try { return new URL(match[1]); } catch { return null; }
}

export async function readSavedPage(file: File) {
  const start = new TextDecoder().decode(await file.slice(0, 180).arrayBuffer());
  if (/^from: <saved by blink>|^snapshot-content-location:/i.test(start)) return readSavedArchive(file);
  if (file.size > 2 * 1024 * 1024) throw new Error('HTML file is over 2 MB');
  const markup = await file.text();
  if (!/<!doctype html|<html\b/i.test(markup.slice(0, 2000))) throw new Error('File is not a saved HTML page');
  const source = savedSource(markup);
  if (!source) throw new Error('Saved page source URL is missing');
  return { source, markup, images: new Map<string, File>() };
}

function field(doc: Document, selector: string): string {
  if (!selector) return '';
  let node: Element | null;
  try { node = doc.querySelector(selector); } catch { return ''; }
  if (!node) return '';
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || '';
    if (/^(?:tel|sms|mailto):/i.test(href)) return href.replace(/^(?:tel|sms|mailto):/i, '').trim();
  }
  return textWithLines(node);
}

export function extractFields(doc: Document, rule: SiteRule) {
  const selectors = rule.selectors;
  return { title: field(doc, selectors.title), description: field(doc, selectors.description), age: field(doc, selectors.age),
    location: field(doc, selectors.location), phone: field(doc, selectors.phone), email: field(doc, selectors.email), images: selectors.images };
}

export async function readSavedPosts(input: File[], rules: SiteRule[] = []): Promise<{ posts: ImportedPost[]; skipped: string[]; untrained: UntrainedPage[] }> {
  // Saved Chrome pages may have a title with a dot but no extension. Treat only known images as assets.
  const isPage = (file: File) => !mediaType(file);
  const htmlFiles = input.filter(isPage);
  const assets = new Map<string, File>();
  const names = new Map<string, File | null>();
  for (const file of input.filter(file => !isPage(file))) {
    assets.set(normalizedPath(file.webkitRelativePath || file.name), file);
    const name = file.name.toLowerCase();
    names.set(name, names.has(name) ? null : file);
  }
  const posts: ImportedPost[] = [];
  const skipped: string[] = [];
  const untrained: UntrainedPage[] = [];
  for (const file of htmlFiles.slice(0, 100)) {
    let markup: string;
    let source: URL | null;
    let archivedImages = new Map<string, File>();
    try {
      const archive = await readSavedPage(file);
      ({ markup, source } = archive);
      archivedImages = archive.images;
    } catch (error) {
      skipped.push(`${file.name}: ${error instanceof Error ? error.message : 'Saved page could not be read'}.`);
      continue;
    }
    const mega = ['megapersonals.eu', 'www.megapersonals.eu'].includes(source.hostname.toLowerCase()) && /^\/public\/post_detail\/\d+\/?$/.test(source.pathname);
    const rule = findRule(source, rules);
    if (!mega && !rule) { untrained.push({ file, domain: domainFor(source), sourceUrl: source.href }); continue; }
    // DOMParser gives us an inert document. Never render saved markup or run its scripts.
    const document = new DOMParser().parseFromString(markup, 'text/html');
    const titleNode = mega && !rule ? document.querySelector('.post_preview_title')?.cloneNode(true) as Element | undefined : undefined;
    titleNode?.querySelector('.post_preview_date_time')?.remove();
    const ageLine = mega && !rule ? [...document.querySelectorAll('.isee-age > div')].find(row => /\bage\b/i.test(row.querySelector('.isee-age__label')?.textContent || '')) : undefined;
    const extracted = rule ? extractFields(document, rule) : {
      title: textWithLines(titleNode || null), description: field(document, '.postbody'),
      age: ageLine?.querySelector('.isee-age__value')?.textContent || '', location: field(document, '.prev_city span'),
      phone: field(document, '.post_preview_phone a[href^="tel:"]'), email: field(document, '.post_preview_body a[href^="mailto:"]'),
      images: '.viewpostgallery img.post_preview_image',
    };
    const title = extracted.title.replace(/\s+/g, ' ').slice(0, 140);
    const description = extracted.description.slice(0, 2950);
    const parsedAge = Number(extracted.age.match(/\b\d{2,3}\b/)?.[0]);
    const { phone, email } = extracted;
    const location = extracted.location.replace(/\s+/g, ' ').slice(0, 200);
    const warnings: string[] = [];
    if (title.length < 5) warnings.push('Title needs review');
    if (description.length < 20) warnings.push('Description needs review');
    const pictures: File[] = [];
    const htmlPath = normalizedPath(file.webkitRelativePath || file.name);
    const base = new URL(htmlPath, 'https://saved.local/');
    let imageNodes: Element[] = [];
    try { imageNodes = [...document.querySelectorAll(extracted.images)]; } catch { warnings.push('Picture selector needs review'); }
    const sources = [...new Set(imageNodes.map(image => image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('href') || '').filter(Boolean))];
    for (const src of sources.slice(0, 6)) {
      if (!src || /^(data:|blob:)/i.test(src)) { warnings.push('A picture needs to be added manually'); continue; }
      const archived = archivedImages.get(new URL(src, source).href);
      if (archived) { pictures.push(archived); continue; }
      if (/^https?:/i.test(src)) { warnings.push('A picture was not saved in the archive'); continue; }
      let path: string;
      try { path = normalizedPath(new URL(src, base).pathname); } catch { warnings.push('A picture path could not be read'); continue; }
      const image = assets.get(path) || names.get(path.split('/').pop()!.toLowerCase());
      if (!image) { warnings.push('A companion picture file is missing'); continue; }
      const type = mediaType(image);
      if (!type || !image.size || image.size > 5 * 1024 * 1024) { warnings.push('A picture is unsupported or over 5 MB'); continue; }
      pictures.push(image.type === type ? image : new File([image], image.name, { type, lastModified: image.lastModified }));
    }
    if (sources.length > 6) warnings.push('Only the first six pictures can be used');
    if (!pictures.length) warnings.push('Add pictures before publishing');
    posts.push({ id: source.href, sourceUrl: source.href, sourceName: rule?.name || 'MegaPersonals', title, description, age: parsedAge >= 18 && parsedAge <= 120 ? parsedAge : undefined, location, phone, email, pictures, warnings: [...new Set(warnings)], owner: '', category: '', targets: [], posted: false });
  }
  if (htmlFiles.length > 100) skipped.push('Only the first 100 HTML files were read.');
  return { posts, skipped, untrained };
}
