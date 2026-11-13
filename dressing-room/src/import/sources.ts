export type ImportErrorCode =
  | 'tooBig' | 'notImage' | 'clipboardEmpty' | 'clipboardDenied' | 'badUrl' | 'pinterest' | 'cors' | 'urlNotImage';

const MAX_URL_BYTES = 15 * 1024 * 1024;

export class ImportError extends Error {
  constructor(public code: ImportErrorCode) { super(code); }
}

export type Origin = { type: 'file' | 'paste' | 'url'; url?: string };
export interface Picked { blob: Blob; origin: Origin }

export function fromFile(file: File | Blob | null | undefined, type: Origin['type'] = 'file'): Picked {
  if (!file) throw new ImportError('notImage');
  // Some iOS pickers give an empty type; let the decoder decide in that case.
  if (file.type && !file.type.startsWith('image/')) throw new ImportError('notImage');
  return { blob: file, origin: { type } };
}

/** Image from a paste / drop DataTransfer, or null when it carries none. */
export function fromDataTransfer(dt: DataTransfer | null, type: Origin['type']): Picked | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return { blob: f, origin: { type } };
    }
  }
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith('image/')) return { blob: f, origin: { type } };
  }
  return null;
}

/** Explicit "paste" button. Must be called from a user gesture. */
export async function fromClipboard(): Promise<Picked> {
  if (!navigator.clipboard?.read) throw new ImportError('clipboardDenied');
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new ImportError('clipboardDenied');
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return { blob: await item.getType(type), origin: { type: 'paste' } };
  }
  throw new ImportError('clipboardEmpty');
}

export function classifyUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new ImportError('badUrl'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ImportError('badUrl');
  const host = url.hostname.toLowerCase();
  // Pin pages are HTML and blocked; direct i.pinimg.com image links are fine to try.
  if (host === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(host)) throw new ImportError('pinterest');
  return url;
}

export async function fromUrl(raw: string): Promise<Picked> {
  const url = classifyUrl(raw);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  let blob: Blob;
  try {
    const res = await fetch(url.href, {
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal,
    });
    if (!res.ok) throw new ImportError('cors');
    if (Number(res.headers.get('content-length') ?? 0) > MAX_URL_BYTES) throw new ImportError('tooBig');
    blob = await res.blob();
  } catch (e) {
    if (e instanceof ImportError) throw e;
    // The browser hides the reason (CORS, offline, DNS, timeout); CORS is by far the usual one.
    throw new ImportError('cors');
  } finally {
    clearTimeout(timer);
  }
  if (blob.size > MAX_URL_BYTES) throw new ImportError('tooBig');
  if (!blob.type.startsWith('image/')) throw new ImportError('urlNotImage');
  return { blob, origin: { type: 'url', url: url.href } };
}
