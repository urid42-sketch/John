import { canvasToBlob, ctx2d, decodeToCanvas, makeCanvas, releaseCanvas } from './load';

export interface BgProgress { phase: 'download' | 'compute'; ratio: number }

/**
 * Automatic background removal, fully in the browser. The library (and its ~80MB model) is
 * loaded lazily on first use only. Returns a mask canvas the size of `src`.
 */
const READY_KEY = 'bg-model-ready', RUNNING_KEY = 'bg-run-in-progress';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ }
  },
};
/** The model was downloaded and ran successfully at least once on this device. */
export const isModelReady = () => ls.get(READY_KEY) === '1';
/** True once if the previous run never finished (the tab most likely ran out of memory). */
export function consumeCrashFlag(): boolean {
  const crashed = ls.get(RUNNING_KEY) !== null;
  if (crashed) ls.set(RUNNING_KEY, null);
  return crashed;
}

let inflight: Promise<unknown> = Promise.resolve();

/** Runs are serialized: two models in memory at once would kill a phone tab. */
export function autoMask(
  src: HTMLCanvasElement, onProgress?: (p: BgProgress) => void,
): Promise<HTMLCanvasElement> {
  const run = inflight.catch(() => undefined).then(async () => {
    ls.set(RUNNING_KEY, String(Date.now()));
    try {
      const mask = await runModel(src, onProgress);
      ls.set(READY_KEY, '1');
      return mask;
    } finally {
      ls.set(RUNNING_KEY, null);
    }
  });
  inflight = run;
  return run;
}

async function runModel(
  src: HTMLCanvasElement, onProgress?: (p: BgProgress) => void,
): Promise<HTMLCanvasElement> {
  if (!src.width) throw new Error('source released');
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
