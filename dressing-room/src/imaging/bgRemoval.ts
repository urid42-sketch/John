import { canvasToBlob, ctx2d, decodeToCanvas, makeCanvas, releaseCanvas } from './load';

export interface BgProgress { phase: 'download' | 'compute'; ratio: number }

/**
 * Automatic background removal, fully in the browser. The library (and its ~80MB model) is
 * loaded lazily on first use only. Returns a mask canvas the size of `src`.
 */
export async function autoMask(
  src: HTMLCanvasElement, onProgress?: (p: BgProgress) => void,
): Promise<HTMLCanvasElement> {
  const input = await canvasToBlob(src, 'image/png');
  const { removeBackground } = await import('@imgly/background-removal');
  const totals = new Map<string, [number, number]>();
  const out = await removeBackground(input, {
    model: 'isnet_fp16',
    output: { format: 'image/png' },
    progress: (key: string, current: number, total: number) => {
      if (!onProgress) return;
      if (key.startsWith('fetch')) {
        totals.set(key, [current, total]);
        let c = 0, t = 0;
        for (const [a, b] of totals.values()) { c += a; t += b; }
        onProgress({ phase: 'download', ratio: t ? c / t : 0 });
      } else {
        onProgress({ phase: 'compute', ratio: total ? current / total : 0 });
      }
    },
  });
  const cut = await decodeToCanvas(out, Math.max(src.width, src.height));
  const mask = makeCanvas(src.width, src.height);
  const ctx = ctx2d(mask);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, mask.width, mask.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(cut, 0, 0, mask.width, mask.height);
  releaseCanvas(cut);
  return mask;
}
