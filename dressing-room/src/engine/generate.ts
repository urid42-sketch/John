import { bodyRowAt } from './body';
import { boxOf, clamp, L, lerp, M, mix, Q, rng, spline, unionBox } from './geometry';
import { normalizeDesign } from './templates';
import type { Body, Fold, GarmentDesign, GarmentGeometry, Piece, Profile, Pt, Rect } from './types';

/** Outward flare along the skirt (t: 0 at the waist … 1 at the hem), in hip half-widths. */
export const PROFILE: Record<Profile, (t: number, tKnee: number, flare: number) => number> = {
  fitted: () => 0,
  aline: (t, _k, f) => 1.5 * f * t,
  mermaid: (t, k, f) => (t < k ? 0 : 1.8 * f * ((t - k) / (1 - k)) ** 2),
};

const ROWS = 18;
const pt = (x: number, y: number): Pt => ({ x, y });

export function hemYOf(d: GarmentDesign, b: Body): number {
  const H = b.ankle.y - b.shoulder.y;
  if (d.type === 'top') return lerp(b.waist.y - 0.3 * (b.waist.y - b.bust.y), b.crotchY, d.hem);
  if (d.type === 'pants') return lerp(b.crotchY + 0.05 * H, b.ankle.y + 0.02 * H, d.hem);
  return lerp(b.hip.y + 0.02 * H, b.floorY - 0.01 * H, d.hem);
}

/** Garment half-outline at height y: body + waist fit + ease + flare. */
function silhouette(d: GarmentDesign, b: Body, hemY: number) {
  const hw = (b.hip.r - b.hip.l) / 2;
  const tKnee = clamp((b.knee.y - b.waist.y) / Math.max(1, hemY - b.waist.y), 0.05, 0.92);
  return (y: number) => {
    let { l, r } = bodyRowAt(b, y);
    if (y > b.hip.y && d.profile === 'aline') { l = b.hip.l; r = b.hip.r; } // hangs from the hips
    if (y > b.bust.y && y < b.hip.y) {
      // loose waist: straight line from bust to hip instead of following the body in
      const k = (y - b.bust.y) / (b.hip.y - b.bust.y);
      l = lerp(Math.min(lerp(b.bust.l, b.hip.l, k), l), l, d.waistFit);
      r = lerp(Math.max(lerp(b.bust.r, b.hip.r, k), r), r, d.waistFit);
    }
    const t = clamp((y - b.waist.y) / Math.max(1, hemY - b.waist.y), 0, 1);
    const out = hw * (d.ease + PROFILE[d.profile](t, tKnee, d.flare));
    return { l: l - out, r: r + out };
  };
}

/** Hem from the bottom-left to the bottom-right corner: shallow arc, optional slit wedge. */
function hemEdge(a: Pt, b: Pt, d: GarmentDesign, body: Body, hemY: number): { d: string; pts: Pt[] } {
  const hw = (body.hip.r - body.hip.l) / 2;
  const depth = hw * (0.05 + 0.22 * (d.type === 'top' ? 0 : d.flare));
  const at = (u: number) => pt(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + depth * Math.sin(Math.PI * u));
  const N = 12;
  if (!d.slit) {
    const pts = Array.from({ length: N + 1 }, (_, i) => at(i / N));
    return { d: spline(pts), pts };
  }
  const u0 = d.slit.side === 'left' ? 0.27 : d.slit.side === 'right' ? 0.73 : 0.5;
  const half = clamp((hw * (0.12 + 0.1 * d.slit.height)) / Math.max(1, b.x - a.x), 0.02, 0.12);
  const apex = pt(lerp(a.x, b.x, u0), hemY - d.slit.height * (hemY - body.hip.y) * 0.92);
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    if (u < u0 - half) left.push(at(u));
    else if (u > u0 + half) right.push(at(u));
  }
  left.push(at(u0 - half));
  right.unshift(at(u0 + half));
  return { d: spline(left) + L(apex) + L(right[0]) + spline(right), pts: [...left, apex, ...right] };
}

function skirtFolds(d: GarmentDesign, b: Body, hemY: number, row: (y: number) => { l: number; r: number }): Fold[] {
  const rand = rng(d.seed);
  const hw = (b.hip.r - b.hip.l) / 2;
  const amount = d.type === 'top' ? 0.1 : d.flare + (1 - d.waistFit) * 0.3;
  const n = Math.round(2 + 9 * amount);
  const startY = d.profile === 'mermaid' ? lerp(b.knee.y, hemY, 0.05) : lerp(b.waist.y, b.hip.y, 0.5);
  if (hemY - startY < hw * 0.3) return [];
  const top = row(startY), bottom = row(hemY);
  const folds: Fold[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5 + (rand() - 0.5) * 0.6) / n;
    const yb = hemY + hw * 0.05;
    folds.push({
      a: pt(lerp(top.l, top.r, lerp(0.5, u, 0.7)), startY + rand() * (hemY - startY) * 0.25),
      b: pt(lerp(bottom.l, bottom.r, u), yb),
      width: hw * (0.1 + 0.14 * rand()) * (0.6 + amount), depth: 0.35 + 0.45 * rand(),
    });
  }
  return folds;
}

interface TopEdge { d: string; pts: Pt[]; extra: Piece[]; neck: Pt[]; shoulders: boolean }

/** Top edge of a dress / top, drawn from the right underarm point to the left one. */
function topEdge(d: GarmentDesign, b: Body, Ru: Pt, Lu: Pt): TopEdge {
  const cx = (Ru.x + Lu.x) / 2, yu = Ru.y;
  const sw = b.shoulder.r - b.shoulder.l;
  const torso = b.waist.y - b.shoulder.y;
  const hwU = (Ru.x - Lu.x) / 2;
  const withSleeves = d.sleeves === 'short' || d.sleeves === 'puff' || d.sleeves === 'long';
  const extra: Piece[] = [];
  const strapTop = (side: 1 | -1) => {
    const n = side > 0 ? b.neck.r : b.neck.l, s = side > 0 ? b.shoulder.r : b.shoulder.l;
    return pt(lerp(n, s, 0.42), lerp(b.neck.y, b.shoulder.y, 0.78));
  };
  const strap = (from: Pt, side: 1 | -1) => {
    const to = strapTop(side), w = Math.max(1.5, sw * 0.022);
    const pts = [pt(from.x - w, from.y + w), pt(from.x + w, from.y + w), pt(to.x + w, to.y), pt(to.x - w, to.y)];
    extra.push({ id: side > 0 ? 'strapR' : 'strapL', d: M(pts[0]) + L(pts[1]) + L(pts[2]) + L(pts[3]) + ' Z', z: 0, folds: [], box: boxOf(pts) });
  };

  if (d.neckline === 'strapless' || d.neckline === 'offShoulder') {
    const sweet = d.neckline === 'strapless';
    const rise = sweet ? torso * (0.06 + 0.1 * d.neckDepth) : 0;
    const dip = sweet ? torso * (0.02 + 0.07 * d.neckDepth) : torso * 0.02;
    const peakR = pt(cx + hwU * 0.52, yu - rise), peakL = pt(cx - hwU * 0.52, yu - rise);
    const mid = pt(cx, yu + dip);
    const path = sweet
      ? Q(pt(Ru.x - hwU * 0.05, yu - rise * 1.3), peakR) + Q(pt(cx + hwU * 0.12, yu - rise * 0.9), mid) +
        Q(pt(cx - hwU * 0.12, yu - rise * 0.9), peakL) + Q(pt(Lu.x + hwU * 0.05, yu - rise * 1.3), Lu)
      : Q(mid, Lu);
    if (d.sleeves === 'spaghetti') { strap(pt(peakR.x, peakR.y), 1); strap(pt(peakL.x, peakL.y), -1); }
    if (d.neckline === 'offShoulder') {
      const arm = sw * 0.14, yb = lerp(b.shoulder.y, yu, 0.5), hb = torso * 0.17;
      const a = pt(b.shoulder.l - arm, yb + hb * 0.25), c = pt(b.shoulder.r + arm, yb + hb * 0.25);
      const a2 = pt(a.x + arm * 0.25, a.y + hb), c2 = pt(c.x - arm * 0.25, c.y + hb);
      extra.push({
        id: 'band', z: 2, folds: [],
        d: M(a) + Q(pt(cx, yb + hb * 0.9), c) + L(c2) + Q(pt(cx, yb + hb * 1.95), a2) + ' Z',
        box: boxOf([a, c, a2, c2, pt(cx, yb + hb * 1.5)]),
      });
    }
    return { d: path, pts: [peakR, peakL, mid], extra, neck: [peakR, mid, peakL], shoulders: false };
  }

  if (d.neckline === 'halter') {
    const hr = pt(b.neck.r + sw * 0.015, lerp(b.neck.y, b.shoulder.y, 0.35));
    const hl = pt(b.neck.l - sw * 0.015, hr.y);
    const depthY = lerp(b.shoulder.y + torso * 0.12, b.bust.y + torso * 0.1, d.neckDepth);
    const mid = pt(cx, depthY);
    const path = Q(pt(lerp(Ru.x, hr.x, 0.25), lerp(yu, hr.y, 0.45)), hr) + L(pt(hr.x - sw * 0.05, hr.y)) + L(mid) +
      L(pt(hl.x + sw * 0.05, hl.y)) + L(hl) + Q(pt(lerp(Lu.x, hl.x, 0.25), lerp(yu, hl.y, 0.45)), Lu);
    return { d: path, pts: [hr, hl, mid], extra, neck: [hr, mid, hl], shoulders: false };
  }

  if (d.sleeves === 'spaghetti') {
    // camisole: the neckline sits between two strap points just above the bust
    const ar = pt(lerp(cx, Ru.x, 0.62), yu - 0.32 * (yu - b.shoulder.y)), al = pt(2 * cx - ar.x, ar.y);
    const depthY = lerp(ar.y + torso * 0.04, b.bust.y + torso * 0.12, d.neckDepth);
    const mid = pt(cx, depthY);
    const neck = d.neckline === 'v' ? L(mid) + L(al) : Q(pt(ar.x - hwU * 0.05, depthY), mid) + Q(pt(al.x + hwU * 0.05, depthY), al);
    strap(ar, 1); strap(al, -1);
    return {
      d: Q(pt(Ru.x - hwU * 0.02, lerp(yu, ar.y, 0.7)), ar) + neck + Q(pt(Lu.x + hwU * 0.02, lerp(yu, al.y, 0.7)), Lu),
      pts: [ar, al, mid], extra, neck: [ar, mid, al], shoulders: false,
    };
  }

  // round / V with shoulders
  const outer = (side: 1 | -1) => {
    const n = side > 0 ? b.neck.r : b.neck.l, s = side > 0 ? b.shoulder.r : b.shoulder.l;
    return withSleeves ? pt(s, b.shoulder.y) : pt(lerp(n, s, 0.72), lerp(b.neck.y, b.shoulder.y, 0.9));
  };
  const inner = (side: 1 | -1) => {
    const n = side > 0 ? b.neck.r : b.neck.l, s = side > 0 ? b.shoulder.r : b.shoulder.l;
    return pt(lerp(n, s, 0.14), lerp(b.neck.y, b.shoulder.y, 0.55));
  };
  const or = outer(1), ol = outer(-1), ir = inner(1), il = inner(-1);
  const depthY = lerp(b.shoulder.y + torso * 0.1, b.bust.y + torso * 0.12, d.neckDepth);
  const mid = pt(cx, depthY);
  const armR = pt(Math.min(Ru.x, or.x) - sw * 0.05, lerp(yu, or.y, 0.3));
  const armL = pt(Math.max(Lu.x, ol.x) + sw * 0.05, lerp(yu, ol.y, 0.3));
  const neck = d.neckline === 'v' ? L(mid) + L(il) : Q(pt(ir.x, depthY), mid) + Q(pt(il.x, depthY), il);
  return {
    d: Q(armR, or) + L(ir) + neck + L(ol) + Q(armL, Lu),
    pts: [or, ol, ir, il, mid], extra, neck: [ir, mid, il], shoulders: true,
  };
}

function sleevePiece(d: GarmentDesign, b: Body, side: 1 | -1, armpit: Pt): Piece {
  const S = pt(side > 0 ? b.shoulder.r : b.shoulder.l, b.shoulder.y);
  const U = pt(armpit.x - side * (b.shoulder.r - b.shoulder.l) * 0.03, armpit.y);
  const W = side > 0 ? b.wristR : b.wristL;
  const A0 = mix(S, U, 0.5);
  const len = Math.hypot(W.x - A0.x, W.y - A0.y) || 1;
  const dir = pt((W.x - A0.x) / len, (W.y - A0.y) / len);
  // normal pointing away from the body
  let n = pt(-dir.y, dir.x);
  if (n.x * side < 0) n = pt(-n.x, -n.y);
  const topHalf = Math.hypot(S.x - U.x, S.y - U.y) / 2 * 1.08;
  const t = d.sleeves === 'long' ? 1 : d.sleeves === 'puff' ? 0.3 : 0.27;
  const puff = d.sleeves === 'puff';
  const half = (k: number) => lerp(topHalf, topHalf * 0.5, k) * (1 + d.ease * 1.5);
  const c = (k: number) => pt(A0.x + dir.x * len * k, A0.y + dir.y * len * k);
  const outerAt = (k: number, extra = 0) => { const p = c(k), h = half(k) + extra; return pt(p.x + n.x * h, p.y + n.y * h); };
  const innerAt = (k: number, extra = 0) => { const p = c(k), h = half(k) + extra; return pt(p.x - n.x * h, p.y - n.y * h); };
  const cuffScale = puff ? -topHalf * 0.12 : 0;
  const outer = [pt(S.x - side * topHalf * 0.2, S.y - topHalf * 0.12), outerAt(t * 0.35, puff ? topHalf * 0.55 : topHalf * 0.08), outerAt(t * 0.7, puff ? topHalf * 0.5 : 0), outerAt(t, cuffScale)];
  const innerP = [innerAt(t, cuffScale), innerAt(t * 0.5, puff ? topHalf * 0.2 : 0), U];
  const start = pt(lerp(S.x, U.x, 0.5) - side * topHalf * 0.9, lerp(S.y, U.y, 0.5)); // hidden under the bodice
  const all = [start, ...outer, ...innerP];
  const folds: Fold[] = puff
    ? [0.3, 0.55, 0.8].map((u) => ({ a: mix(outer[1], innerP[1], u * 0.6), b: mix(outer[3], innerP[0], u), width: topHalf * 0.22, depth: 0.5 }))
    : d.sleeves === 'long'
      ? [{ a: mix(outerAt(0.45), innerAt(0.45), 0.2), b: mix(outerAt(0.55), innerAt(0.55), 0.85), width: topHalf * 0.3, depth: 0.4 }]
      : [];
  return {
    id: side > 0 ? 'sleeveR' : 'sleeveL', z: 0, folds, box: boxOf(all),
    d: M(start) + L(outer[0]) + spline(outer) + L(innerP[0]) + spline(innerP) + ' Z',
  };
}

function torsoGarment(d: GarmentDesign, b: Body): GarmentGeometry {
  const hemY = hemYOf(d, b);
  const row = silhouette(d, b, hemY);
  const yu = b.underarm.y;
  const ys = Array.from({ length: ROWS + 1 }, (_, i) => lerp(yu, hemY, i / ROWS));
  const Lside = ys.map((y) => pt(row(y).l, y));
  const Rside = ys.map((y) => pt(row(y).r, y)).reverse();
  const hem = hemEdge(Lside[ROWS], Rside[0], d, b, hemY);
  const top = topEdge(d, b, Rside[ROWS], Lside[0]);
  const bodyPath = M(Lside[0]) + spline(Lside) + hem.d + spline(Rside) + top.d + ' Z';
  const bodyPts = [...Lside, ...Rside, ...hem.pts, ...top.pts];
  const pieces: Piece[] = [{ id: 'body', d: bodyPath, z: 1, folds: skirtFolds(d, b, hemY, row), box: boxOf(bodyPts) }, ...top.extra];
  if (top.shoulders && (d.sleeves === 'short' || d.sleeves === 'puff' || d.sleeves === 'long')) {
    pieces.push(sleevePiece(d, b, 1, Rside[ROWS]), sleevePiece(d, b, -1, Lside[0]));
  }
  const wy = clamp(b.waist.y, yu, hemY), w = row(wy);
  const hwU = (b.hip.r - b.hip.l) / 2;
  const cx = (w.l + w.r) / 2;
  const neckBottom = top.neck[1];
  return finish(pieces, {
    waist: [pt(w.l, wy), pt(cx, wy + hwU * 0.04), pt(w.r, wy)],
    hem: hem.pts, neckline: top.neck,
    front: [neckBottom, pt(neckBottom.x, hemY)],
  }, hwU);
}

function waistband(b: Body, wl: number, wr: number, h: number): Piece {
  const y = b.waist.y, cx = (wl + wr) / 2;
  const pts = [pt(wl, y - h), pt(wr, y - h), pt(wr, y + h * 0.15), pt(wl, y + h * 0.15)];
  return {
    id: 'waistband', z: 2, folds: [], box: boxOf(pts, h * 0.2),
    d: M(pts[0]) + Q(pt(cx, y - h * 0.8), pts[1]) + L(pts[2]) + Q(pt(cx, y + h * 0.45), pts[3]) + ' Z',
  };
}

function skirtGarment(d: GarmentDesign, b: Body): GarmentGeometry {
  const hemY = hemYOf(d, b);
  const row = silhouette({ ...d, waistFit: 1 }, b, hemY);
  const ys = Array.from({ length: ROWS + 1 }, (_, i) => lerp(b.waist.y, hemY, i / ROWS));
  const Lside = ys.map((y) => pt(row(y).l, y));
  const Rside = ys.map((y) => pt(row(y).r, y)).reverse();
  const hem = hemEdge(Lside[ROWS], Rside[0], d, b, hemY);
  const hwU = (b.hip.r - b.hip.l) / 2, cx = (Lside[0].x + Rside[ROWS].x) / 2;
  const bodyPath = M(Lside[0]) + spline(Lside) + hem.d + spline(Rside) + Q(pt(cx, b.waist.y + hwU * 0.05), Lside[0]) + ' Z';
  const wbH = hwU * 0.16;
  const pieces: Piece[] = [
    { id: 'body', d: bodyPath, z: 1, folds: skirtFolds(d, b, hemY, row), box: boxOf([...Lside, ...Rside, ...hem.pts]) },
    waistband(b, Lside[0].x, Rside[ROWS].x, wbH),
  ];
  const top = pt(cx, b.waist.y - wbH);
  return finish(pieces, {
    waist: [pt(Lside[0].x, b.waist.y - wbH * 0.4), pt(cx, b.waist.y - wbH * 0.3), pt(Rside[ROWS].x, b.waist.y - wbH * 0.4)],
    hem: hem.pts, neckline: [pt(Lside[0].x, top.y), top, pt(Rside[ROWS].x, top.y)],
    front: [top, pt(cx, hemY)],
  }, hwU);
}

function pantsGarment(d: GarmentDesign, b: Body): GarmentGeometry {
  const hemY = hemYOf(d, b);
  const hw = (b.hip.r - b.hip.l) / 2, cx = b.cx;
  const legLen = Math.max(1, b.ankle.y - b.hip.y);
  const widen = (y: number) => hw * (d.ease + d.flare * 1.1 * clamp((y - b.knee.y) / Math.max(1, b.ankle.y - b.knee.y), 0, 1.2) ** 2);
  const outer = (y: number) => {
    const r = bodyRowAt(b, y), o = y <= b.hip.y ? hw * d.ease : widen(y) ;
    return { l: r.l - o, r: r.r + o };
  };
  const crotch = pt(cx, b.crotchY + hw * (0.06 + d.ease * 0.6));
  const inner = (y: number) => {
    const t = clamp((y - crotch.y) / legLen, 0, 1.3);
    const kt = clamp((y - crotch.y) / Math.max(1, b.knee.y - crotch.y), 0, 1);
    const base = (i: 'l' | 'r') => (y <= b.knee.y ? lerp(cx, b.innerKnee[i], kt) : lerp(b.innerKnee[i], b.innerAnkle[i], clamp((y - b.knee.y) / Math.max(1, b.ankle.y - b.knee.y), 0, 1.2)));
    const o = widen(y) * 0.7 * Math.min(1, t * 6);
    return { l: Math.min(base('l') + o, cx - 1), r: Math.max(base('r') - o, cx + 1) };
  };
  const ysO = Array.from({ length: ROWS + 1 }, (_, i) => lerp(b.waist.y, hemY, i / ROWS));
  const ysI = Array.from({ length: 10 }, (_, i) => lerp(hemY, crotch.y, i / 9));
  const Lo = ysO.map((y) => pt(outer(y).l, y));
  const Ro = ysO.map((y) => pt(outer(y).r, y)).reverse();
  const Li = [...ysI.slice(0, -1).map((y) => pt(inner(y).l, y)), crotch];
  const Ri = [crotch, ...ysI.slice(0, -1).reverse().map((y) => pt(inner(y).r, y))];
  const path = M(Lo[0]) + spline(Lo) + L(Li[0]) + spline(Li) + spline(Ri) + L(Ro[0]) + spline(Ro) + Q(pt(cx, b.waist.y + hw * 0.04), Lo[0]) + ' Z';
  const folds: Fold[] = [];
  for (const s of [-1, 1] as const) {
    const xTop = cx + s * hw * 0.5, o = outer(hemY), i = inner(hemY);
    const xBot = s < 0 ? (o.l + i.l) / 2 : (o.r + i.r) / 2;
    if (hemY - b.crotchY > hw * 0.6) folds.push({ a: pt(xTop, b.hip.y), b: pt(xBot, hemY), width: hw * 0.1, depth: 0.45 });
    folds.push({ a: pt(cx + s * hw * 0.15, crotch.y), b: pt(cx + s * hw * 0.75, lerp(b.hip.y, crotch.y, 0.4)), width: hw * 0.12, depth: 0.35 });
  }
  const wbH = hw * 0.16;
  const pieces: Piece[] = [
    { id: 'legs', d: path, z: 1, folds, box: boxOf([...Lo, ...Ro, ...Li, ...Ri]) },
    waistband(b, Lo[0].x, Ro[ROWS].x, wbH),
  ];
  const top = pt(cx, b.waist.y - wbH);
  return finish(pieces, {
    waist: [pt(Lo[0].x, b.waist.y - wbH * 0.4), pt(cx, b.waist.y - wbH * 0.3), pt(Ro[ROWS].x, b.waist.y - wbH * 0.4)],
    hem: [Lo[ROWS], Li[0], Ri[Ri.length - 1], Ro[0]],
    neckline: [pt(Lo[0].x, top.y), top, pt(Ro[ROWS].x, top.y)],
    front: [top, crotch],
  }, hw);
}

function finish(pieces: Piece[], curves: GarmentGeometry['curves'], unit: number): GarmentGeometry {
  let bbox: Rect = pieces[0].box;
  for (const p of pieces) bbox = unionBox(bbox, p.box);
  const pad = unit * 0.35; // room for ruffles, bows and the soft outline
  bbox = { x: bbox.x - pad, y: bbox.y - pad, w: bbox.w + pad * 2, h: bbox.h + pad * 2 };
  return { pieces: [...pieces].sort((a, b) => a.z - b.z), curves, bbox, unit };
}

/** design + body → geometry. Pure and deterministic. */
export function generate(design: GarmentDesign, b: Body): GarmentGeometry {
  const d = normalizeDesign(design);
  if (d.type === 'pants') return pantsGarment(d, b);
  if (d.type === 'skirt') return skirtGarment(d, b);
  return torsoGarment(d, b);
}
