// Free automatic fitting: no AI model, only the silhouettes (alpha channels) of the doll photo and
// of the garment photo. Pure functions, unit-tested.
import type { BodyCalibration, Category, Pt } from '../db/types';
import { bodyRowAt } from './body';
import type { Body } from './types';

export interface AlphaMap { w: number; h: number; data: Uint8Array }
interface Run { l: number; r: number }

const T = 60; // alpha threshold
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function runsOf(m: AlphaMap, y: number): Run[] {
  const out: Run[] = [];
  let start = -1;
  const row = y * m.w;
  for (let x = 0; x <= m.w; x++) {
    const on = x < m.w && m.data[row + x] > T;
    if (on && start < 0) start = x;
    else if (!on && start >= 0) { if (x - start >= 2) out.push({ l: start, r: x - 1 }); start = -1; }
  }
  return out;
}
/** The run that contains (or is nearest to) column cx: the torso, as opposed to the arms. */
function centralRun(runs: Run[], cx: number): Run | null {
  let best: Run | null = null, bestD = Infinity;
  for (const r of runs) {
    const d = cx < r.l ? r.l - cx : cx > r.r ? cx - r.r : 0;
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}
const width = (r: Run | null) => (r ? r.r - r.l + 1 : 0);

/**
 * Find shoulders, waist, hips, ankles and wrists of a frontal standing figure from its cutout.
 * Returns null when the silhouette does not look like one (the caller falls back to defaults).
 */
export function autoCalibrate(m: AlphaMap): BodyCalibration | null {
  const { w, h } = m;
  if (w < 20 || h < 60) return null;
  const Y = (f: number) => clamp(Math.round(f * h), 0, h - 1);

  // head column: centre of mass of the top rows
  let sx = 0, n = 0;
  for (let y = Y(0.02); y < Y(0.1); y++) for (const r of runsOf(m, y)) { sx += ((r.l + r.r) / 2) * width(r); n += width(r); }
  if (!n) return null;
  let cx = sx / n;
  const central = (y: number) => centralRun(runsOf(m, y), cx);

  // neck = narrowest row under the head; shoulders = where the figure suddenly widens below it
  let neckY = Y(0.1), neckW = Infinity;
  for (let y = Y(0.07); y < Y(0.24); y++) { const c = width(central(y)); if (c > 0 && c < neckW) { neckW = c; neckY = y; } }
  if (!Number.isFinite(neckW)) return null;
  let maxW = 0;
  for (let y = neckY; y < Math.min(h, neckY + Y(0.16)); y++) maxW = Math.max(maxW, width(central(y)));
  if (maxW < neckW * 1.5) return null; // no shoulders: not a standing person
  let shoulderY = neckY;
  for (let y = neckY; y < Math.min(h, neckY + Y(0.16)); y++) { if (width(central(y)) >= maxW * 0.8) { shoulderY = y; break; } }
  const sRun = central(Math.min(h - 1, shoulderY + Math.round(h * 0.012)))!;
  const sInset = width(sRun) * 0.05;
  const shoulderW = width(sRun) - sInset * 2;
  cx = (sRun.l + sRun.r) / 2;

  // Waist and hips. With the arms held away from the body the torso is its own run and can be read
  // directly: waist = narrowest row, hips = widest row below it. With the arms resting against the
  // body that run includes them, so the hips are taken from the thighs (below the hands, where only
  // the legs remain) and the waist from typical proportions.
  const ankleRow = Y(0.945), span = ankleRow - shoulderY;
  const from = shoulderY + Math.round(span * 0.17), to = Math.min(h - 1, shoulderY + Math.round(span * 0.36));
  let waistY = from, waistW = Infinity;
  for (let y = from; y < to; y++) { const c = width(central(y)); if (c > 0 && c < waistW) { waistW = c; waistY = y; } }
  let hipY = Math.min(h - 1, waistY + Math.round(span * 0.12)), hipW = 0;
  for (let y = waistY + Math.round(span * 0.06); y < Math.min(h, waistY + Math.round(span * 0.2)); y++) {
    const c = width(central(y));
    if (c > hipW) { hipW = c; hipY = y; }
  }
  let thighL = Infinity, thighR = -Infinity;
  for (let y = shoulderY + Math.round(span * 0.6); y < shoulderY + Math.round(span * 0.68); y++) {
    for (const r of runsOf(m, Math.min(h - 1, y))) {
      if (r.r < cx - shoulderW * 0.75 || r.l > cx + shoulderW * 0.75) continue; // a hand hanging low
      thighL = Math.min(thighL, r.l); thighR = Math.max(thighR, r.r);
    }
  }
  const thighW = thighR - thighL + 1, mid = Number.isFinite(thighL) ? (thighL + thighR) / 2 : cx;
  const hipEst = Number.isFinite(thighL) ? thighW / 0.93 : shoulderW * 0.95;
  const around = (centre: number, wd: number): Run => ({ l: centre - wd / 2, r: centre + wd / 2 });
  const merged = waistY - from < (to - from) * 0.12 || waistW > hipEst * 0.95 || hipW > hipEst * 1.15;
  let waist: Run, hip: Run;
  if (merged || !central(waistY) || !central(hipY)) {
    waistY = shoulderY + Math.round(span * 0.268);
    hipY = shoulderY + Math.round(span * 0.4);
    hip = around(mid, hipEst);
    waist = around(mid, hipEst * 0.8);
  } else {
    waist = central(waistY)!;
    hip = central(hipY)!;
  }

  // ankles: the two leg runs near the bottom
  const ankleY = ankleRow;
  const legs = runsOf(m, ankleY);
  let aL: number, aR: number;
  if (legs.length >= 2) { aL = (legs[0].l + legs[0].r) / 2; aR = (legs[legs.length - 1].l + legs[legs.length - 1].r) / 2; }
  else { const mid = legs[0] ? (legs[0].l + legs[0].r) / 2 : cx; aL = mid - width(hip) * 0.16; aR = mid + width(hip) * 0.16; }

  // wrists: the lowest point of each arm (a run lying fully outside the torso run)
  const wrist = (side: -1 | 1): Pt => {
    for (let y = Math.min(h - 1, hipY + Y(0.18)); y > shoulderY + Y(0.1); y--) {
      const c = central(y);
      if (!c) continue;
      // an arm lies outside the hips; the legs (also separate runs lower down) lie within them
      const arm = runsOf(m, y).find((r) => (side < 0 ? r.r < Math.min(c.l, hip.l) : r.l > Math.max(c.r, hip.r)));
      if (arm) return { x: (arm.l + arm.r) / 2, y: y - h * 0.03 };
    }
    const c = central(hipY)!; // arms resting against the body
    return { x: side < 0 ? c.l : c.r, y: hipY };
  };
  const wl = wrist(-1), wr = wrist(1);

  const N = (x: number, y: number): Pt => ({ x: clamp(x / w, 0, 1), y: clamp(y / h, 0, 1) });
  const sy = shoulderY + h * 0.012;
  return {
    shoulderL: N(sRun.l + sInset, sy), shoulderR: N(sRun.r - sInset, sy),
    waistL: N(waist.l, waistY), waistR: N(waist.r, waistY),
    hipL: N(hip.l, hipY), hipR: N(hip.r, hipY),
    ankleL: N(aL, ankleY), ankleR: N(aR, ankleY),
    wristL: N(wl.x, wl.y), wristR: N(wr.x, wr.y),
  };
}

export interface Placement { x: number; y: number; scale: number; stretchX: number; fit: number[] }
export const FIT_SAMPLES = 32;

/**
 * Place an imported garment on the body: scale it so its own shoulder-to-waist distance and waist
 * width match hers, centre it on her, and widen the rows where it would be narrower than the body
 * (so her own clothes do not peek out at the sides). Returns null when there is nothing to go on.
 */
export function fitGarment(
  g: AlphaMap, aspect: number /* garment w / h */, category: Category, b: Body, dollW: number, dollH: number,
): Placement | null {
  if (category === 'shoes' || category === 'accessory' || g.h < 16 || g.w < 8) return null;
  const gcx = (g.w - 1) / 2;
  const rowW = (v: number) => { // torso width of the garment at height fraction v, as a fraction of its width
    const y = clamp(Math.round(v * (g.h - 1)), 0, g.h - 1);
    const c = centralRun(runsOf(g, y), gcx);
    return { w: width(c) / g.w, mid: c ? ((c.l + c.r) / 2 + 0.5) / g.w : 0.5 };
  };
  const H = b.ankle.y - b.shoulder.y;
  const bodyW = (y: number) => { const r = bodyRowAt(b, y); return { w: r.r - r.l, mid: (r.l + r.r) / 2 }; };

  let topY: number, heightPx: number, anchorV: number, anchorBodyY: number;
  if (category === 'dress') {
    // the dress's own waist: its narrowest row in the upper part
    let wv = 0.38, min = Infinity;
    for (let v = 0.2; v <= 0.6; v += 0.01) { const r = rowW(v).w; if (r > 0.05 && r < min) { min = r; wv = v; } }
    let below = 0;
    for (let v = 0.7; v <= 0.98; v += 0.02) below = Math.max(below, rowW(v).w);
    if (min > below * 0.93) wv = 0.38; // straight cut: no visible waist, use a typical proportion
    topY = lerp(b.neck.y, b.shoulder.y, 0.55);
    heightPx = (b.waist.y - topY) / wv;
    anchorV = wv; anchorBodyY = b.waist.y;
  } else if (category === 'top') {
    topY = lerp(b.neck.y, b.shoulder.y, 0.55);
    anchorV = 0.82; // below the sleeves
    const target = bodyW(lerp(b.waist.y, b.hip.y, 0.4)).w * 1.14;
    heightPx = target / Math.max(0.05, rowW(anchorV).w) / aspect;
    heightPx = clamp(heightPx, (b.waist.y - topY) * 0.8, b.crotchY + 0.06 * H - topY); // crop top … tunic
    anchorBodyY = topY + anchorV * heightPx;
  } else {
    // skirt / pants hang from the waist
    topY = b.waist.y - 0.012 * H;
    anchorV = 0.04;
    const target = bodyW(b.waist.y).w * 1.08;
    heightPx = target / Math.max(0.05, rowW(anchorV).w) / aspect;
    if (category === 'pants' && 1 / aspect > 1.5) heightPx = b.ankle.y + 0.01 * H - topY; // full-length trousers
    heightPx = clamp(heightPx, 0.12 * H, b.floorY - topY);
    anchorBodyY = b.waist.y;
  }
  if (!Number.isFinite(heightPx) || heightPx < 0.08 * H || heightPx > 1.25 * H) return null;

  const widthPx = heightPx * aspect;
  const a = rowW(anchorV), body = bodyW(anchorBodyY);
  // Stretching sideways distorts sleeves and prints, so it is kept gentle; the row profile below
  // covers whatever is still narrower than the body.
  const ease = category === 'top' ? 1.1 : 1.02;
  const stretchX = clamp((body.w * ease) / Math.max(1, a.w * widthPx), 0.88, 1.18);
  const cx = body.mid - (a.mid - 0.5) * widthPx * stretchX;

  // row profile: where the garment is narrower than the body between underarm and hips, widen it
  const fit: number[] = [];
  for (let i = 0; i < FIT_SAMPLES; i++) {
    const v = (i + 0.5) / FIT_SAMPLES, y = topY + v * heightPx;
    let s = 1;
    if (y > b.underarm.y - 0.01 * H && y < b.hip.y + 0.03 * H) {
      const gw = rowW(v).w * widthPx * stretchX;
      if (gw > 4) s = clamp((bodyW(y).w * 1.05) / gw, 1, 1.35);
    }
    fit.push(s);
  }
  for (let pass = 0; pass < 2; pass++) { // smooth, so the outline stays a curve
    const src = [...fit];
    for (let i = 0; i < FIT_SAMPLES; i++) fit[i] = (src[Math.max(0, i - 1)] + src[i] * 2 + src[Math.min(FIT_SAMPLES - 1, i + 1)]) / 4;
  }
  const flat = fit.every((s) => s < 1.015);
  return {
    x: cx / dollW, y: (topY + heightPx / 2) / dollH, scale: heightPx / dollH, stretchX,
    fit: flat ? [] : fit.map((s) => Math.round(s * 1000) / 1000),
  };
}

/** Row scale at height fraction v, interpolated from the fit profile. */
export function fitScaleAt(fit: number[], v: number): number {
  if (!fit.length) return 1;
  const p = clamp(v * fit.length - 0.5, 0, fit.length - 1), i = Math.floor(p), j = Math.min(fit.length - 1, i + 1);
  return lerp(fit[i], fit[j], p - i);
}
