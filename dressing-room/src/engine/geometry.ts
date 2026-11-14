import type { Pt, Rect } from './types';

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const f = (n: number) => (Math.round(n * 10) / 10).toString();
export const P = (p: Pt) => `${f(p.x)} ${f(p.y)}`;

export const M = (p: Pt) => `M${P(p)}`;
export const L = (p: Pt) => ` L${P(p)}`;
export const Q = (c: Pt, p: Pt) => ` Q${P(c)} ${P(p)}`;

/** Smooth curve through pts (Catmull-Rom → cubic Béziers), continuing from pts[0]. */
export function spline(pts: Pt[]): string {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d;
}

export function boxOf(pts: Pt[], pad = 0): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export function unionBox(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Point at fraction t (0..1) along a polyline, with the local direction. */
export function along(pts: Pt[], t: number): { p: Pt; dir: Pt } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l); total += l;
  }
  let target = clamp(t, 0, 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? target / lens[i] : 0;
      const a = pts[i], b = pts[i + 1];
      const n = lens[i] || 1;
      return { p: mix(a, b, clamp(k, 0, 1)), dir: { x: (b.x - a.x) / n, y: (b.y - a.y) / n } };
    }
    target -= lens[i];
  }
  return { p: pts[0], dir: { x: 1, y: 0 } };
}

/** Deterministic RNG so folds and prints do not jump between renders. */
export function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
