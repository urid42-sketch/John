import { fabricTile } from '../engine/fabricTiles';
import { drawDetails, rasterGeometry } from '../engine/render';
import type { Fabric, GarmentDesign } from '../engine/types';
import { ctx2d, cropCanvas, makeCanvas, releaseCanvas } from './load';
import { alphaBBox } from './mask';
import { applyFabricPixels, recolor, warpRowScale, type RecolorParams } from './recolor';

// Every effect takes a canvas and returns a NEW canvas (the input is left untouched), so the same
// code serves the low-res live preview and the full-resolution "apply".

export function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

/** Crop away fully transparent margins (returns the same canvas if nothing to trim). */
export function trimCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const d = ctx2d(src, true).getImageData(0, 0, src.width, src.height);
  const box = alphaBBox(d.data, src.width, src.height);
  if (!box || (box.w === src.width && box.h === src.height)) return src;
  const out = cropCanvas(src, box);
  releaseCanvas(src);
  return out;
}

export function fxRecolor(src: HTMLCanvasElement, p: RecolorParams, sel: HTMLCanvasElement | null): HTMLCanvasElement {
  const out = copyCanvas(src);
  const ctx = ctx2d(out, true);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  let selPx: Uint8ClampedArray | undefined;
  if (sel) {
    const m = makeCanvas(out.width, out.height);
    const mctx = ctx2d(m, true);
    mctx.drawImage(sel, 0, 0, m.width, m.height); // upscaling also feathers the edge
    selPx = mctx.getImageData(0, 0, m.width, m.height).data;
    releaseCanvas(m);
  }
  recolor(img.data, p, selPx);
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Stretch or squeeze the horizontal band between y0 and y1 (fractions); the hem is preserved. */
export function fxLength(src: HTMLCanvasElement, y0: number, y1: number, k: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const a = Math.round(Math.min(y0, y1) * h), b = Math.round(Math.max(y0, y1) * h);
  const band = Math.max(1, b - a), newBand = Math.max(0, Math.round(band * k));
  const out = makeCanvas(w, Math.max(4, h - band + newBand));
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = 'high';
  if (a > 0) ctx.drawImage(src, 0, 0, w, a, 0, 0, w, a);
  if (newBand > 0) ctx.drawImage(src, 0, a, w, band, 0, a, w, newBand);
  if (h - b > 0) ctx.drawImage(src, 0, b, w, h - b, 0, a + newBand, w, h - b);
  return out;
}

/** Gentle warp by scaling each pixel row about the centre line. */
export function fxWarp(src: HTMLCanvasElement, waist: number, waistY: number, hem: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const W = Math.ceil(w * (1 + Math.max(0, hem) + Math.max(0, -waist)));
  const out = makeCanvas(W, h);
  const ctx = ctx2d(out);
  for (let y = 0; y < h; y++) {
    const dw = w * warpRowScale(y / (h - 1 || 1), waist, waistY, hem);
    ctx.drawImage(src, 0, y, w, 1, (W - dw) / 2, y, dw, 1);
  }
  return out;
}

/** Re-cover the garment with a fabric, keeping its shape and (optionally) its own folds. */
export function fxFabric(src: HTMLCanvasElement, fabric: Fabric, keepShading: number): HTMLCanvasElement {
  const out = copyCanvas(src);
  const ctx = ctx2d(out, true);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const f = makeCanvas(out.width, out.height);
  const fctx = ctx2d(f, true);
  const pattern = fctx.createPattern(fabricTile(fabric), 'repeat');
  if (pattern && 'setTransform' in pattern) pattern.setTransform(new DOMMatrix().scale((out.width / 700) * fabric.scale));
  fctx.fillStyle = pattern ?? fabric.colors[0];
  fctx.fillRect(0, 0, f.width, f.height);
  applyFabricPixels(img.data, fctx.getImageData(0, 0, f.width, f.height).data, keepShading);
  ctx.putImageData(img, 0, 0);
  releaseCanvas(f);
  return out;
}

/** Bake details onto the image. A margin is added so ruffles and bows are not clipped. */
export function fxDetails(src: HTMLCanvasElement, design: GarmentDesign): HTMLCanvasElement {
  const pad = Math.round(Math.max(src.width, src.height) * 0.08);
  const out = makeCanvas(src.width + pad * 2, src.height + pad * 2);
  const ctx = ctx2d(out);
  ctx.drawImage(src, pad, pad);
  drawDetails(ctx, rasterGeometry(pad, pad, src.width, src.height), design);
  return out;
}
