import type Konva from 'konva';
import { canvasToBlob, ctx2d, makeCanvas, releaseCanvas, scaledCopy } from '../imaging/load';

let backdrop: Promise<HTMLImageElement> | null = null;
function loadBackdrop(): Promise<HTMLImageElement> {
  backdrop ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { backdrop = null; reject(new Error('backdrop')); };
    img.src = '/closet.jpg';
  });
  return backdrop;
}

export interface LookImage { png: Blob; w: number; h: number; thumb: Blob; thumbW: number; thumbH: number }

/**
 * Picture of the current try-on: the closet backdrop (same framing as on screen: cover, anchored
 * to the bottom) with the doll and garments on top. `withBackdrop: false` gives a transparent PNG.
 */
export async function renderLook(stage: Konva.Stage, withBackdrop = true): Promise<LookImage> {
  const sw = stage.width(), sh = stage.height();
  const ratio = Math.min(3, 1600 / Math.max(sw, sh));
  const layer = stage.toCanvas({ pixelRatio: ratio });
  const out = makeCanvas(layer.width, layer.height);
  const ctx = ctx2d(out);
  if (withBackdrop) {
    ctx.fillStyle = '#e9dccb';
    ctx.fillRect(0, 0, out.width, out.height);
    try {
      const bg = await loadBackdrop();
      const bw = bg.naturalWidth, bh = bg.naturalHeight;
      const k = Math.max(out.width / bw, out.height / bh);
      ctx.drawImage(bg, (out.width - bw * k) / 2, out.height - bh * k, bw * k, bh * k);
    } catch { /* plain backdrop colour is fine */ }
  }
  ctx.drawImage(layer, 0, 0);
  releaseCanvas(layer);
  const thumbC = scaledCopy(out, 320);
  try {
    const [png, thumb] = await Promise.all([canvasToBlob(out, withBackdrop ? 'image/jpeg' : 'image/png', 0.92), canvasToBlob(thumbC, 'image/jpeg', 0.85)]);
    return { png, w: out.width, h: out.height, thumb, thumbW: thumbC.width, thumbH: thumbC.height };
  } finally {
    releaseCanvas(out); releaseCanvas(thumbC);
  }
}

/** Share sheet on phones (save to Photos / Files, send…), plain download elsewhere. */
export async function shareImage(blob: Blob, name: string): Promise<void> {
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'application/zip' ? 'zip' : 'jpg';
  const file = new File([blob], `${name}.${ext}`, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if ((e as Error).name === 'AbortError') return; /* fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
