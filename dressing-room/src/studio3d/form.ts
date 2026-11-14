// Pure geometry of the tailor's dress form and of garments wrapped around it (no three.js, no DOM).
// Units are the same "body units" the 2D pattern engine uses (600×1000 croquis), re-centred so
// x = 0 is the middle. y grows downward. z is depth (+ = front).
import { CANONICAL } from '../engine/body';
import { hemYOf, PROFILE } from '../engine/generate';
import type { GarmentDesign } from '../engine/types';

/** One horizontal slice of the form: half-width and front / back depth. */
interface Row { y: number; hw: number; df: number; db: number }
const ROWS: Row[] = [
  { y: 116, hw: 24, df: 24, db: 24 }, { y: 146, hw: 27, df: 26, db: 27 }, { y: 166, hw: 52, df: 31, db: 35 },
  { y: 186, hw: 82, df: 37, db: 41 }, { y: 214, hw: 87, df: 47, db: 45 }, { y: 250, hw: 72, df: 56, db: 46 },
  { y: 285, hw: 73, df: 62, db: 46 }, { y: 330, hw: 62, df: 51, db: 44 }, { y: 380, hw: 55, df: 44, db: 42 },
  { y: 425, hw: 70, df: 50, db: 52 }, { y: 470, hw: 82, df: 54, db: 60 }, { y: 520, hw: 80, df: 52, db: 58 },
  { y: 548, hw: 68, df: 44, db: 48 },
];
export const FORM_TOP = ROWS[0].y, FORM_BOTTOM = 566, FLOOR_Y = 985;
export const LEVELS = { neck: 150, shoulder: 188, underarm: 250, bust: 285, waist: 380, hip: 470 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth (Catmull-Rom) interpolation of the slice parameters at height y. */
export function rowAt(y: number): Row {
  const n = ROWS.length;
  if (y <= ROWS[0].y) return { ...ROWS[0], y };
  if (y >= ROWS[n - 1].y) { // rounded underside
    const t = clamp((y - ROWS[n - 1].y) / (FORM_BOTTOM - ROWS[n - 1].y), 0, 1), k = Math.sqrt(Math.max(0, 1 - t * t));
    const r = ROWS[n - 1];
    return { y, hw: r.hw * k, df: r.df * k, db: r.db * k };
  }
  let i = 0;
  while (ROWS[i + 1].y < y) i++;
  const p0 = ROWS[Math.max(0, i - 1)], p1 = ROWS[i], p2 = ROWS[i + 1], p3 = ROWS[Math.min(n - 1, i + 2)];
  const t = (y - p1.y) / (p2.y - p1.y);
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  return { y, hw: Math.max(1, cr(p0.hw, p1.hw, p2.hw, p3.hw)), df: Math.max(1, cr(p0.df, p1.df, p2.df, p3.df)), db: Math.max(1, cr(p0.db, p1.db, p2.db, p3.db)) };
}

/** Point on a slice at angle theta (0 = front centre, π/2 = one side). */
export function sectionPoint(r: Row, theta: number, bust = true): { x: number; z: number } {
  const s = Math.sin(theta), c = Math.cos(theta), e = 0.86;
  const x = r.hw * Math.sign(s) * Math.abs(s) ** e;
  let z = (c >= 0 ? r.df : r.db) * Math.sign(c) * Math.abs(c) ** e;
  if (bust && c > 0) { // two soft mounds
    const v = Math.exp(-(((r.y - 288) / 34) ** 2));
    z += 13 * v * (Math.exp(-(((x - 33) / 23) ** 2)) + Math.exp(-(((x + 33) / 23) ** 2))) * c;
  }
  return { x, z };
}
export const formPoint = (y: number, theta: number) => sectionPoint(rowAt(y), theta);

export interface Shell {
  rows: number; cols: number;
  /** pos[row][col] in body units */
  pos: { x: number; y: number; z: number }[][];
  yTop: number; yHem: number;
}

/** The garment as a tube of cloth around the form: follows the body, then hangs and flares. */
export function garmentShell(d: GarmentDesign, cols = 96, rows = 90): Shell {
  const b = CANONICAL;
  const yHem = Math.min(hemYOf(d, b), FLOOR_Y - 30);
  const waistTop = d.type === 'skirt' || d.type === 'pants';
  const yTop = waistTop ? LEVELS.waist - 14 : LEVELS.neck - 4;
  const tKnee = clamp((b.knee.y - LEVELS.waist) / Math.max(1, yHem - LEVELS.waist), 0.05, 0.92);
  const hipRow = rowAt(LEVELS.hip), bustRow = rowAt(LEVELS.bust);
  const flareOn = d.type !== 'top' && d.type !== 'pants';
  const amount = !flareOn ? 0.1 : d.profile === 'fitted' ? 0.12 : d.profile === 'mermaid' ? 0.4 + 0.5 * d.flare : 0.3 + 0.8 * d.flare;
  const pleats = Math.round(9 + 12 * (flareOn ? d.flare : 0));
  const phase = (d.seed % 628) / 100;
  const pos: Shell['pos'] = [];
  for (let i = 0; i <= rows; i++) {
    const y = lerp(yTop, yHem, i / rows);
    let r = y <= LEVELS.hip ? rowAt(y) : { ...hipRow, y };
    if (y > LEVELS.hip && (d.profile === 'fitted' || d.profile === 'mermaid') && d.type !== 'pants') {
      // nothing holds the cloth out below the hips: it falls in slightly
      const k = 1 - 0.14 * clamp((y - LEVELS.hip) / 260, 0, 1);
      r = { y, hw: hipRow.hw * k, df: hipRow.df * k, db: hipRow.db * k };
    }
    if (!waistTop && y > LEVELS.bust && y < LEVELS.hip) { // loose waist: straight from bust to hip
      const k = (y - LEVELS.bust) / (LEVELS.hip - LEVELS.bust), w = 1 - d.waistFit;
      r = {
        y, hw: lerp(r.hw, Math.max(r.hw, lerp(bustRow.hw, hipRow.hw, k)), w),
        df: lerp(r.df, Math.max(r.df, lerp(bustRow.df, hipRow.df, k)), w), db: lerp(r.db, Math.max(r.db, lerp(bustRow.db, hipRow.db, k)), w),
      };
    }
    const t = clamp((y - LEVELS.waist) / Math.max(1, yHem - LEVELS.waist), 0, 1);
    const out = 3 + hipRow.hw * (d.ease * 0.9 + (flareOn ? PROFILE[d.profile](t, tKnee, d.flare) * 0.62 : 0));
    const grow = d.profile === 'mermaid' ? clamp((t - tKnee) / (1 - tKnee), 0, 1) : clamp((y - LEVELS.waist - 10) / 150, 0, 1);
    const row: Shell['pos'][number] = [];
    for (let j = 0; j <= cols; j++) {
      const theta = (j / cols) * Math.PI * 2 - Math.PI; // seam at the back
      const p = sectionPoint({ y, hw: r.hw + out, df: r.df + out * 0.85, db: r.db + out * 0.85 }, theta, y < LEVELS.waist);
      const wave = Math.sin(theta * pleats + phase) + 0.3 * Math.sin(theta * pleats * 2.3 + 1.7);
      const m = 1 + 0.055 * amount * grow * wave * (1 + t);
      row.push({ x: p.x * m, y: y + (flareOn ? 6 * amount * grow * t * Math.cos(theta * pleats + phase) : 0), z: p.z * m });
    }
    pos.push(row);
  }
  return { rows, cols, pos, yTop, yHem };
}

/**
 * Is there cloth at (x, y) on the front / back of the garment tube? This is where necklines,
 * armholes and straps are cut. x is the sideways position on the body (0 = centre).
 */
export function hasCloth(d: GarmentDesign, x: number, y: number, front: boolean): boolean {
  if (d.type === 'skirt' || d.type === 'pants') return true;
  const ax = Math.abs(x), L = LEVELS;
  const depth = lerp(L.shoulder + 14, L.bust + 14, d.neckDepth);
  const sleeved = d.sleeves === 'short' || d.sleeves === 'puff' || d.sleeves === 'long';

  if (d.neckline === 'strapless' || d.neckline === 'offShoulder') {
    const sweet = d.neckline === 'strapless';
    const rise = sweet ? (14 + 16 * d.neckDepth) * Math.exp(-(((ax - 36) / 26) ** 2)) : 0;
    const top = front ? L.underarm - 4 - rise + (sweet ? 8 * d.neckDepth * Math.exp(-((ax / 14) ** 2)) : 0) : L.underarm + 4;
    if (y >= top) return true;
    if (d.neckline === 'offShoulder') return y >= L.shoulder + 22 && y <= L.underarm + 2 && (ax > 44 || y > L.underarm - 14);
    return d.sleeves === 'spaghetti' && Math.abs(ax - 36) < 3.2 && y > L.neck + 12;
  }
  if (d.neckline === 'halter') {
    if (!front) return y >= L.underarm + 6 || (y < L.neck + 10 && y > L.neck - 2 && ax < 26);
    if (y >= L.underarm) return true;
    const k = clamp((y - (L.neck + 4)) / (L.underarm - L.neck - 4), 0, 1);
    if (ax > lerp(20, 74, k ** 0.8)) return false;
    return y >= depth - (depth - (L.neck + 6)) * clamp(ax / 20, 0, 1); // V opening
  }
  if (d.sleeves === 'spaghetti') { // camisole
    const camiTop = L.underarm - 22;
    if (Math.abs(ax - 40) < 3.2 && y > L.neck + 14 && y <= camiTop + 6) return true; // straps
    if (!front) return y >= L.underarm - 4;
    const edge = camiTop + (ax > 40 ? (ax - 40) * 0.55 : 0);
    const dip = lerp(camiTop + 6, L.bust + 16, d.neckDepth);
    const k = clamp(ax / 40, 0, 1);
    const open = dip - (dip - camiTop) * (d.neckline === 'v' ? k : k * k);
    return y >= (ax < 40 ? Math.max(edge, open) : edge);
  }
  // round / V neck with shoulders
  if (y < L.neck + 2 + Math.max(0, ax - 28) * 0.36) return false; // above the shoulder line
  if (y < L.underarm) { // armholes
    const outer = sleeved ? 90 : lerp(64, 73, clamp((y - L.shoulder) / (L.underarm - L.shoulder), 0, 1) ** 2);
    if (ax > outer) return false;
  }
  const inner = 34;
  if (ax < inner) {
    const k = ax / inner;
    if (!front) return y >= L.neck + 16 - 10 * k * k;
    return y >= depth - (depth - (L.neck + 8)) * (d.neckline === 'v' ? k : k * k);
  }
  return true;
}
