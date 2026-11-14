// Pure pixel operations for editing imported garments (unit-tested, no DOM).

export interface RecolorParams {
  /** colorize: repaint in `color` keeping the folds · shift: rotate the existing hues */
  mode: 'colorize' | 'shift';
  color: [number, number, number]; // target RGB for colorize
  hue: number; // degrees, for shift
  saturation: number; // -1..1 extra saturation
  strength: number; // 0..1 blend with the original
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Recolour in place. `sel` (same size, RGBA) limits the effect to where its alpha is set.
 * Colorize keeps each pixel's lightness relative to the garment's average, so shading and
 * folds survive even when turning white into red or black into pink.
 */
export function recolor(px: Uint8ClampedArray, p: RecolorParams, sel?: Uint8ClampedArray): void {
  const n = px.length / 4;
  const weight = (i: number) => (px[i * 4 + 3] === 0 ? 0 : sel ? sel[i * 4 + 3] / 255 : 1);
  const [th, ts, tl] = rgbToHsl(...p.color);
  let meanL = 0.5;
  if (p.mode === 'colorize') {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const w = weight(i);
      if (w > 0.5) { sum += (Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) + Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])) / 510; cnt++; }
    }
    if (cnt) meanL = sum / cnt;
  }
  for (let i = 0; i < n; i++) {
    const w = weight(i) * p.strength;
    if (w <= 0) continue;
    const o = i * 4;
    const [h, s, l] = rgbToHsl(px[o], px[o + 1], px[o + 2]);
    let out: [number, number, number];
    if (p.mode === 'colorize') {
      // contrast around the mean is kept, slightly compressed for very dark / light targets
      const contrast = 0.55 + 0.9 * Math.min(tl, 1 - tl);
      out = hslToRgb(th, clamp01(ts * (1 + p.saturation)), clamp01(tl + (l - meanL) * contrast));
    } else {
      out = hslToRgb(h + p.hue, clamp01(s * (1 + p.saturation)), l);
    }
    px[o] = px[o] + (out[0] - px[o]) * w;
    px[o + 1] = px[o + 1] + (out[1] - px[o + 1]) * w;
    px[o + 2] = px[o + 2] + (out[2] - px[o + 2]) * w;
  }
}

/**
 * Lay a new fabric over the garment: `fabric` pixels take the garment's alpha and are shaded by
 * its lightness relative to the average, so the original folds stay visible. Writes into `px`.
 */
export function applyFabricPixels(px: Uint8ClampedArray, fabric: Uint8ClampedArray, keepShading = 1): void {
  const n = px.length / 4;
  let sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] > 128) { sum += 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; cnt++; }
  }
  const mean = cnt ? Math.max(24, sum / cnt) : 128;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (px[o + 3] === 0) continue;
    const lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
    const k = 1 + (Math.min(1.5, Math.max(0.35, lum / mean)) - 1) * keepShading;
    const fa = fabric[o + 3] / 255; // lace keeps its holes
    px[o] = Math.min(255, fabric[o] * k);
    px[o + 1] = Math.min(255, fabric[o + 1] * k);
    px[o + 2] = Math.min(255, fabric[o + 2] * k);
    px[o + 3] = px[o + 3] * fa;
  }
}

/** Horizontal scale of row y (0..1 from the top) for the two "gentle warp" sliders. */
export function warpRowScale(y: number, waist: number, waistY: number, hem: number): number {
  const d = (y - waistY) / 0.16;
  const bump = Math.exp(-d * d); // narrow (or widen) around the waist line
  const t = Math.min(1, Math.max(0, (y - 0.5) / 0.5));
  const flare = t * t * (3 - 2 * t); // ease in toward the hem
  return Math.max(0.5, 1 - waist * bump + hem * flare);
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xb9797c;
  return [n >> 16, (n >> 8) & 255, n & 255];
};
