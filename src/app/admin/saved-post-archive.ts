export type SavedArchive = { source: URL; markup: string; images: Map<string, File> };

function byteString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 16384) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 16384)));
  }
  return chunks.join('');
}

function payloadBytes(payload: string, encoding: string): Uint8Array {
  const value = encoding === 'base64' ? atob(payload.replace(/\s/g, '')) : payload;
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index);
  return bytes;
}

function headers(value: string): Map<string, string> {
  const result = new Map<string, string>();
  let name = '';
  for (const line of value.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && name) { result.set(name, `${result.get(name)} ${line.trim()}`); continue; }
    const divider = line.indexOf(':');
    if (divider < 1) continue;
    name = line.slice(0, divider).toLowerCase();
    result.set(name, line.slice(divider + 1).trim());
  }
  return result;
}

/** Read Chrome's offline MHTML archive in the browser without executing its markup. */
export async function readSavedArchive(file: File): Promise<SavedArchive> {
  if (file.size > 35 * 1024 * 1024) throw new Error('Archive is over 35 MB');
  const raw = byteString(new Uint8Array(await file.arrayBuffer()));
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd < 0) throw new Error('Archive headers are missing');
  const main = headers(raw.slice(0, headerEnd));
  if (!/^multipart\/related\b/i.test(main.get('content-type') || '')) throw new Error('File is not a saved page archive');
  const boundary = main.get('content-type')?.match(/\bboundary="?([^";\s]+)"?/i)?.[1];
  const sourceText = main.get('snapshot-content-location');
  if (!boundary || !sourceText) throw new Error('Archive source or boundary is missing');
  const source = new URL(sourceText);
  const images = new Map<string, File>();
  let markup = '';
  for (const part of raw.slice(headerEnd + 4).split(`--${boundary}`).slice(1)) {
    if (part.startsWith('--')) break;
    const value = part.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    const split = value.indexOf('\r\n\r\n');
    if (split < 0) continue;
    const meta = headers(value.slice(0, split));
    const contentType = (meta.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const transfer = (meta.get('content-transfer-encoding') || 'binary').toLowerCase();
    if (transfer !== 'binary' && transfer !== 'base64' && transfer !== '8bit') continue;
    const payload = value.slice(split + 4);
    if (contentType === 'text/html' && !markup) {
      markup = new TextDecoder('utf-8').decode(payloadBytes(payload, transfer));
    } else if (['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      const location = meta.get('content-location');
      if (!location) continue;
      const bytes = payloadBytes(payload, transfer);
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) continue;
      const url = new URL(location, source);
      const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
      const name = url.pathname.split('/').pop() || `archive-image.${extension}`;
      images.set(url.href, new File([bytes.buffer as ArrayBuffer], name, { type: contentType }));
    }
  }
  if (!markup) throw new Error('Archive has no HTML page');
  return { source, markup, images };
}
