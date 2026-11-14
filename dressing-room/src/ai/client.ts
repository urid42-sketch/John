import { canvasToBlob, ctx2d, decodeToCanvas, makeCanvas, releaseCanvas } from '../imaging/load';

export type AiErrorCode = 'notConfigured' | 'badPin' | 'failed' | 'offline';
export class AiError extends Error {
  constructor(public code: AiErrorCode) { super(code); }
}

const PIN_KEY = 'ai-pin', CONSENT_KEY = 'ai-consent';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export const aiPin = () => ls.get(PIN_KEY) ?? '';
export const setAiPin = (pin: string | null) => ls.set(PIN_KEY, pin);
export const aiConsented = () => ls.get(CONSENT_KEY) === '1';
export const setAiConsent = () => ls.set(CONSENT_KEY, '1');

/** Flatten onto white and shrink: the provider needs small opaque JPEGs. EXIF never leaves the phone. */
export async function toJpegDataUrl(blob: Blob, maxSide = 1024): Promise<string> {
  const c = await decodeToCanvas(blob, maxSide);
  const flat = makeCanvas(c.width, c.height);
  const ctx = ctx2d(flat);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(c, 0, 0);
  releaseCanvas(c);
  const jpeg = await canvasToBlob(flat, 'image/jpeg', 0.88);
  releaseCanvas(flat);
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new AiError('failed'));
    r.readAsDataURL(jpeg);
  });
}

/** Calls our own serverless function; the provider key never reaches the browser. */
export async function aiRequest(body: { mode: 'tryon' | 'edit'; images: string[]; text?: string }): Promise<Blob> {
  if (!navigator.onLine) throw new AiError('offline');
  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-pin': aiPin() },
      body: JSON.stringify(body),
    });
  } catch { throw new AiError('offline'); }
  if (res.status === 401) { setAiPin(null); throw new AiError('badPin'); }
  // 404/405: running without the serverless function (local dev) · 501: keys not set on Vercel
  if (res.status === 501 || res.status === 404 || res.status === 405) throw new AiError('notConfigured');
  if (!res.ok) throw new AiError('failed');
  // a static host answers /api/ai with the app's HTML page: the function is not deployed
  if (!(res.headers.get('content-type') ?? '').includes('json')) throw new AiError('notConfigured');
  try {
    const { image } = (await res.json()) as { image?: string };
    if (!image?.startsWith('data:image/')) throw new AiError('failed');
    return await (await fetch(image)).blob();
  } catch { throw new AiError('failed'); }
}

/** Decode an AI result into the image + thumbnail pair that looks are stored with. */
export async function toLookRender(blob: Blob) {
  const c = await decodeToCanvas(blob, 1600);
  const k = Math.min(1, 320 / Math.max(c.width, c.height));
  const t = makeCanvas(Math.round(c.width * k), Math.round(c.height * k));
  ctx2d(t).drawImage(c, 0, 0, t.width, t.height);
  try {
    const [png, thumb] = await Promise.all([canvasToBlob(c, 'image/jpeg', 0.92), canvasToBlob(t, 'image/jpeg', 0.85)]);
    return { png, w: c.width, h: c.height, thumb, thumbW: t.width, thumbH: t.height };
  } finally { releaseCanvas(c); releaseCanvas(t); }
}
