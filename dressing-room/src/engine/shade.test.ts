import { describe, expect, it } from 'vitest';
import { boxBlur, distanceField, heightField, shade, type ShadeInput } from './shade';

function disk(w: number, h: number, r: number) {
  const a = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - w / 2, y - h / 2) < r) a[y * w + x] = 255;
  return a;
}
const solid = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255, r, g, b, 255, r, g, b, 255, r, g, b, 255]);
const base = (w: number, h: number, over: Partial<ShadeInput> = {}): ShadeInput => ({
  w, h, alpha: disk(w, h, Math.min(w, h) / 2 - 2), R: 30, folds: [], bumps: [], tile: solid(180, 60, 80), tw: 2, th: 2,
  ox: 0, oy: 0, ts: 0.1, warp: 0, sheen: 0.5, mode: 'matte', ...over,
});

describe('distanceField', () => {
  it('is 0 outside and grows toward the middle', () => {
    const d = distanceField(disk(41, 41, 18), 41, 41);
    expect(d[0]).toBe(0);
    expect(d[20 * 41 + 20]).toBeGreaterThan(15);
    expect(d[20 * 41 + 20]).toBeGreaterThan(d[20 * 41 + 8]);
  });
});

describe('boxBlur', () => {
  it('keeps a constant field constant and smooths a spike', () => {
    const c = new Float32Array(25).fill(3);
    expect(Array.from(boxBlur(c, 5, 5, 1)).every((v) => Math.abs(v - 3) < 1e-5)).toBe(true);
    const s = new Float32Array(25); s[12] = 9;
    const b = boxBlur(s, 5, 5, 1);
    expect(b[12]).toBeCloseTo(1, 5); expect(b[11]).toBeGreaterThan(0);
  });
});

describe('heightField', () => {
  it('is rounded: highest in the middle, zero outside', () => {
    const inp = base(80, 80), H = heightField(inp, distanceField(inp.alpha, 80, 80));
    expect(H[0]).toBe(0);
    expect(H[40 * 80 + 40]).toBeGreaterThan(H[40 * 80 + 8]);
  });
  it('a fold adds relief along its line', () => {
    const plain = base(80, 80), withFold = base(80, 80, { folds: [{ ax: 40, ay: 15, bx: 40, by: 65, width: 4, depth: 1 }] });
    const a = heightField(plain, distanceField(plain.alpha, 80, 80)), b = heightField(withFold, distanceField(withFold.alpha, 80, 80));
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeGreaterThan(5);
  });
});

describe('shade', () => {
  it('returns finite colours, keeps the mask outside transparent and is darker near the edge', () => {
    const inp = base(80, 80), px = shade(inp);
    expect(Array.from(px).every((v) => Number.isFinite(v))).toBe(true);
    expect(px[3]).toBe(0); // corner
    const at = (x: number, y: number) => { const o = (y * 80 + x) * 4; return px[o] + px[o + 1] + px[o + 2]; };
    expect(at(40, 40)).toBeGreaterThan(at(40, 4)); // the rim turns away from the light
    expect(px[(40 * 80 + 40) * 4 + 3]).toBe(255);
  });
  it('satin has a bright highlight that matte lacks', () => {
    const peak = (mode: 'satin' | 'matte') => {
      const px = shade(base(100, 100, { mode, sheen: 1, R: 40 }));
      let m = 0;
      for (let i = 1; i < px.length; i += 4) m = Math.max(m, px[i]); // green: the highlight turns it toward white
      return m;
    };
    expect(peak('satin')).toBeGreaterThan(peak('matte') + 25);
  });
  it('lace lets the lining and holes show through', () => {
    const tile = new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 0, 200, 200, 200, 0, 200, 200, 200, 0]);
    const px = shade(base(60, 60, { mode: 'lace', tile, lining: [220, 190, 180], ts: 0.5 }));
    const alphas = new Set<number>();
    for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) alphas.add(Math.round(px[(y * 60 + x) * 4 + 3] / 10));
    expect(alphas.size).toBeGreaterThan(1); // opaque motif and lighter net
    expect(Math.min(...alphas)).toBeGreaterThan(0); // lining keeps the net from being fully clear
  });
  it('pleats from a drape change the surface', () => {
    const flat = shade(base(100, 120, { R: 40 })), pleated = shade(base(100, 120, { R: 40, drape: { cx: 50, y0: 10, reach: 100, amount: 1, n: 9, phase: 0 } }));
    let d = 0;
    for (let i = 0; i < flat.length; i += 4) d += Math.abs(flat[i] - pleated[i]);
    expect(d).toBeGreaterThan(2000);
  });
});
