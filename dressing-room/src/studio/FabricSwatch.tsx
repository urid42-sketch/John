import { useEffect, useRef } from 'react';
import { fabricTileFor } from '../engine/fabricTiles';
import { shade, type ShadeMode } from '../engine/shade';
import type { Fabric } from '../engine/types';
import { ensureFabricImage } from './renderDesign';

/** A little ball of cloth, lit like the garments, so the choice looks like the real thing. */
export function FabricSwatch({ fabric, size = 52 }: { fabric: Fabric; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let alive = true;
    void ensureFabricImage(fabric).catch(() => undefined).then(() => {
      if (!alive) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), n = Math.round(size * dpr);
      c.width = n; c.height = n;
      const alpha = new Uint8ClampedArray(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) < n / 2 - 1) alpha[y * n + x] = 255;
      const tile = fabricTileFor(fabric, 2.4 / dpr);
      const mode: ShadeMode = fabric.kind === 'satin' ? 'satin' : fabric.kind === 'velvet' ? 'velvet' : fabric.kind === 'lace' ? 'lace' : 'matte';
      const px = shade({
        w: n, h: n, alpha, R: n * 0.5, folds: [], bumps: [], tile: tile.data, tw: tile.w, th: tile.h, ox: 0, oy: 0, ts: tile.ts, warp: 0,
        sheen: fabric.sheen, mode, lining: fabric.kind === 'lace' ? [225, 205, 195] : undefined,
      });
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), n, n), 0, 0);
    });
    return () => { alive = false; };
  }, [fabric, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-full" aria-hidden="true" />;
}
