// Pure pixel helpers (no DOM) so they can be unit-tested.

export interface Rect { x: number; y: number; w: number; h: number }

/** Bounding box of pixels whose alpha exceeds `threshold`; null when nothing is left. */
export function alphaBBox(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 8): Rect | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    let row = y * w * 4 + 3;
    for (let x = 0; x < w; x++, row += 4) {
      if (rgba[row] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Mask for a plain (single-colour) background: flood fill from the image border over pixels
 * close to the border colour. Interior areas of the same colour (e.g. white print) are kept.
 * Returns alpha per pixel: 0 = background, 255 = keep, with a 1px soft edge.
 */
export function plainBackgroundAlpha(
  rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, tolerance = 40,
): Uint8Array {
  const n = w * h;
  // Reference colour: mean of the four corners.
  let r0 = 0, g0 = 0, b0 = 0;
  for (const i of [0, w - 1, (h - 1) * w, n - 1]) {
    r0 += rgba[i * 4]; g0 += rgba[i * 4 + 1]; b0 += rgba[i * 4 + 2];
  }
  r0 /= 4; g0 /= 4; b0 /= 4;
  const tol2 = tolerance * tolerance * 3;
  const isBg = (i: number) => {
    if (rgba[i * 4 + 3] < 16) return true;
    const dr = rgba[i * 4] - r0, dg = rgba[i * 4 + 1] - g0, db = rgba[i * 4 + 2] - b0;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  const bg = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const push = (i: number) => { if (!bg[i] && isBg(i)) { bg[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }

  // Soft edge: 3x3 box average of the hard mask.
  const out = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = 0, cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          cnt++;
          if (!bg[yy * w + xx]) keep++;
        }
      }
      out[y * w + x] = bg[y * w + x] ? 0 : Math.round((keep / cnt) * 255);
    }
  }
  return out;
}

/** Scale (w,h) so the long side is at most maxSide. Never upscales. */
export function fitWithin(w: number, h: number, maxSide: number): { w: number; h: number } {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
