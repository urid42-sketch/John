import type { CutoutResult } from '../db/repo';
import { alphaBBox, fitWithin, plainBackgroundAlpha, type Rect } from './mask';

export class ImageError extends Error {
  constructor(public code: 'notImage' | 'decode' | 'emptyCutout' | 'generic') { super(code); }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
  if (c) { c.width = 0; c.height = 0; }
}
export function ctx2d(c: HTMLCanvasElement, willRead = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', willRead ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new ImageError('generic');
  return ctx;
}

/** Decode any image blob to a canvas with EXIF orientation applied and the long side capped. */
export async function decodeToCanvas(blob: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  if (blob.type && !blob.type.startsWith('image/')) throw new ImageError('notImage');
  let src: ImageBitmap | HTMLImageElement;
  let sw: number, sh: number;
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    src = bmp; sw = bmp.width; sh = bmp.height;
  } catch {
    try {
      const img = await loadImage(blob);
      src = img; sw = img.naturalWidth; sh = img.naturalHeight;
    } catch { throw new ImageError('decode'); }
  }
  if (!sw || !sh) throw new ImageError('decode');
  const { w, h } = fitWithin(sw, sh, maxSide);
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  if ('close' in src) src.close();
  return c;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

export function canvasToBlob(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new ImageError('generic'))), type, quality);
  });
}

export function cropCanvas(src: HTMLCanvasElement, r: Rect): HTMLCanvasElement {
  const c = makeCanvas(Math.max(1, Math.round(r.w)), Math.max(1, Math.round(r.h)));
  ctx2d(c).drawImage(src, Math.round(r.x), Math.round(r.y), c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

export function scaledCopy(src: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const { w, h } = fitWithin(src.width, src.height, maxSide);
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

/** True when the image already has meaningful transparency (e.g. a pre-cut PNG). */
export function hasTransparency(c: HTMLCanvasElement): boolean {
  const small = scaledCopy(c, 128);
  const d = ctx2d(small, true).getImageData(0, 0, small.width, small.height).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 16) clear++;
  releaseCanvas(small);
  return clear > (d.length / 4) * 0.03;
}

/** A mask canvas keeps everything where its alpha is 255. */
export function fullMask(w: number, h: number): HTMLCanvasElement {
  const m = makeCanvas(w, h);
  const ctx = ctx2d(m);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  return m;
}

export function maskFromOwnAlpha(src: HTMLCanvasElement): HTMLCanvasElement {
  const m = fullMask(src.width, src.height);
  const ctx = ctx2d(m);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  return m;
}

export function plainBackgroundMask(src: HTMLCanvasElement, tolerance = 40): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const data = ctx2d(src, true).getImageData(0, 0, w, h);
  const alpha = plainBackgroundAlpha(data.data, w, h, tolerance);
  const out = new ImageData(w, h);
  for (let i = 0; i < alpha.length; i++) {
    out.data[i * 4] = 255; out.data[i * 4 + 1] = 255; out.data[i * 4 + 2] = 255; out.data[i * 4 + 3] = alpha[i];
  }
  const m = makeCanvas(w, h);
  ctx2d(m).putImageData(out, 0, 0);
  return m;
}

export function composite(src: HTMLCanvasElement, mask: HTMLCanvasElement, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? makeCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** Build everything we persist for a doll / garment from the source and its mask. */
export async function buildCutout(src: HTMLCanvasElement, mask: HTMLCanvasElement): Promise<CutoutResult> {
  const full = composite(src, mask);
  const data = ctx2d(full, true).getImageData(0, 0, full.width, full.height);
  const box = alphaBBox(data.data, full.width, full.height);
  if (!box || box.w < 4 || box.h < 4) { releaseCanvas(full); throw new ImageError('emptyCutout'); }
  const cut = cropCanvas(full, box);
  releaseCanvas(full);
  const thumb = scaledCopy(cut, 256);

  // Opaque source goes to JPEG on white (a transparent source would otherwise turn black).
  const flat = makeCanvas(src.width, src.height);
  const fctx = ctx2d(flat);
  fctx.fillStyle = '#fff';
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(src, 0, 0);

  try {
    const [source, maskBlob, cutout, thumbBlob] = await Promise.all([
      canvasToBlob(flat, 'image/jpeg', 0.9),
      canvasToBlob(mask, 'image/png'),
      canvasToBlob(cut, 'image/png'),
      canvasToBlob(thumb, 'image/png'),
    ]);
    return {
      source, sourceW: src.width, sourceH: src.height, mask: maskBlob,
      cutout, w: cut.width, h: cut.height, thumb: thumbBlob, thumbW: thumb.width, thumbH: thumb.height,
    };
  } finally {
    releaseCanvas(flat); releaseCanvas(cut); releaseCanvas(thumb);
  }
}
