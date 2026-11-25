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

export type ImportDefaults = { owner: string; category: string; targets: string[] };

function textWithLines(element: Element | null): string {
  if (!element) return '';
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent || ''); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
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

export async function readSavedPosts(input: File[], defaults: ImportDefaults): Promise<{ posts: ImportedPost[]; skipped: string[] }> {
  const htmlFiles = input.filter(file => /\.html?$/i.test(file.name));
  const assets = new Map<string, File>();
  const names = new Map<string, File | null>();
  for (const file of input.filter(file => !/\.html?$/i.test(file.name))) {
    assets.set(normalizedPath(file.webkitRelativePath || file.name), file);
    const name = file.name.toLowerCase();
    names.set(name, names.has(name) ? null : file);
  }
  const posts: ImportedPost[] = [];
  const skipped: string[] = [];
  for (const file of htmlFiles.slice(0, 100)) {
    if (file.size > 2 * 1024 * 1024) { skipped.push(`${file.name}: HTML file is too large.`); continue; }
    const markup = await file.text();
    const source = savedSource(markup);
    if (!source || !['megapersonals.eu', 'www.megapersonals.eu'].includes(source.hostname.toLowerCase()) || !/^\/public\/post_detail\/\d+\/?$/.test(source.pathname)) {
      skipped.push(`${file.name}: this is not a supported MegaPersonals post detail page.`);
      continue;
    }
    // DOMParser gives us an inert document. Never render saved markup or run its scripts.
    const document = new DOMParser().parseFromString(markup, 'text/html');
    const titleNode = document.querySelector('.post_preview_title')?.cloneNode(true) as Element | undefined;
    titleNode?.querySelector('.post_preview_date_time')?.remove();
    const title = textWithLines(titleNode || null).replace(/\s+/g, ' ').slice(0, 140);
    const description = textWithLines(document.querySelector('.postbody')).slice(0, 2950);
    const ageLine = [...document.querySelectorAll('.isee-age > div')].find(row => /\bage\b/i.test(row.querySelector('.isee-age__label')?.textContent || ''));
    const parsedAge = Number(ageLine?.querySelector('.isee-age__value')?.textContent?.match(/\b\d{2,3}\b/)?.[0]);
    const phone = document.querySelector<HTMLAnchorElement>('.post_preview_phone a[href^="tel:"]')?.getAttribute('href')?.slice(4).trim() || '';
    const email = document.querySelector<HTMLAnchorElement>('.post_preview_body a[href^="mailto:"]')?.getAttribute('href')?.slice(7).trim() || '';
    const location = textWithLines(document.querySelector('.prev_city span')).replace(/\s+/g, ' ').slice(0, 200);
    const warnings: string[] = [];
    if (title.length < 5) warnings.push('Title needs review');
    if (description.length < 20) warnings.push('Description needs review');
    const pictures: File[] = [];
    const htmlPath = normalizedPath(file.webkitRelativePath || file.name);
    const base = new URL(htmlPath, 'https://saved.local/');
    const sources = [...document.querySelectorAll<HTMLImageElement>('.viewpostgallery img.post_preview_image')].map(image => image.getAttribute('src') || '');
    for (const src of sources.slice(0, 6)) {
      if (!src || /^(https?:|data:|blob:)/i.test(src)) { warnings.push('A remote picture needs to be added manually'); continue; }
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
    posts.push({ id: source.href, sourceUrl: source.href, sourceName: 'MegaPersonals', title, description, age: parsedAge >= 18 && parsedAge <= 120 ? parsedAge : undefined, location, phone, email, pictures, warnings: [...new Set(warnings)], owner: defaults.owner, category: defaults.category, targets: [...defaults.targets], posted: false });
  }
  if (htmlFiles.length > 100) skipped.push('Only the first 100 HTML files were read.');
  return { posts, skipped };
}
