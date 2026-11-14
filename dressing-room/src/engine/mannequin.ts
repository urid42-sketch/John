import { M, spline } from './geometry';
import { shade as shadePixels } from './shade';
import type { Body, Pt } from './types';

const pt = (x: number, y: number): Pt => ({ x, y });
const closed = (pts: Pt[]) => new Path2D(M(pts[0]) + spline([...pts, pts[0]]) + ' Z');

/**
 * Shop-window mannequin: one smooth glossy ivory figure with a featureless egg head, drawn in
 * body units (the same landmarks the garments use) and lit by the same model as the cloth.
 */
export function renderMannequin(b: Body, width: number, height: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(width * scale)); c.height = Math.max(1, Math.ceil(height * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const cx = b.cx, sw = b.shoulder.r - b.shoulder.l, H = b.ankle.y - b.shoulder.y;
  const nw = (b.neck.r - b.neck.l) * 0.3; // neck half-width
  const headRy = H * 0.062, headRx = headRy * 0.74, headCy = b.neck.y - headRy * 0.72;
  const thighY = b.crotchY + H * 0.06, calfY = b.knee.y + H * 0.12;
  const lerp = (a: number, b2: number, t: number) => a + (b2 - a) * t;

  // Parts are lit one by one (each is its own rounded volume) and stacked like a real mannequin:
  // arms and legs first, the torso over their joints, the head on top.
  type Part = { pts: Pt[]; path: Path2D; R: number; bust?: boolean };
  const part = (pts: Pt[], R: number, bust = false): Part => ({ pts, path: closed(pts), R, bust });
  const mirror = (pts: Pt[]) => pts.map((p) => pt(2 * cx - p.x, p.y)).reverse();

  const torsoR: Pt[] = [
    pt(cx + nw, b.neck.y - headRy * 0.25), pt(cx + nw * 1.05, b.neck.y + H * 0.012),
    pt(lerp(cx + nw, b.shoulder.r, 0.5), b.shoulder.y - H * 0.014), pt(b.shoulder.r - sw * 0.03, b.shoulder.y + H * 0.006),
    pt(b.shoulder.r - sw * 0.02, lerp(b.shoulder.y, b.underarm.y, 0.55)),
    pt(b.underarm.r, b.underarm.y), pt(b.bust.r, b.bust.y), pt(b.waist.r, b.waist.y), pt(b.hip.r, b.hip.y),
    pt(b.hip.r - sw * 0.03, lerp(b.hip.y, b.crotchY, 0.75)), pt(lerp(cx, b.hip.r, 0.45), b.crotchY + H * 0.012), pt(cx, b.crotchY + H * 0.022),
  ];
  const torso = part([...torsoR, ...mirror(torsoR).slice(1)], sw * 0.5, true);

  const legPts = (side: 1 | -1): Pt[] => {
    const X = (x: number) => (side > 0 ? x : 2 * cx - x);
    return [
      pt(X(b.hip.r - sw * 0.01), b.hip.y), pt(X(lerp(b.hip.r, b.knee.r, 0.45) + sw * 0.012), thighY), pt(X(b.knee.r), b.knee.y),
      pt(X(b.knee.r + sw * 0.014), calfY), pt(X(b.ankle.r - sw * 0.015), b.ankle.y), pt(X(b.ankle.r + sw * 0.03), b.floorY - H * 0.012),
      pt(X(b.ankle.r + sw * 0.035), b.floorY), pt(X(b.innerAnkle.r - sw * 0.02), b.floorY), pt(X(b.innerAnkle.r), b.ankle.y),
      pt(X(b.innerKnee.r - sw * 0.02), calfY), pt(X(b.innerKnee.r), b.knee.y), pt(X(lerp(cx, b.innerKnee.r, 0.3)), thighY),
      pt(X(cx + sw * 0.01), b.hip.y + H * 0.02),
    ];
  };
  const armPts = (side: 1 | -1): Pt[] => {
    const s = pt((side > 0 ? b.shoulder.r : b.shoulder.l) - side * sw * 0.07, b.shoulder.y + H * 0.03);
    const w = side > 0 ? b.wristR : b.wristL;
    const dx = w.x - s.x, dy = w.y - s.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    // half-widths along the arm: shoulder cap, biceps, elbow, forearm, wrist, palm, fingertips
    const prof: [number, number][] = [[-0.04, 0.05], [0.06, 0.088], [0.25, 0.078], [0.5, 0.06], [0.75, 0.055], [1, 0.038], [1.1, 0.048], [1.2, 0.02]];
    const at = (t: number, hw: number, sgn: number) => pt(s.x + ux * len * t + nx * sw * hw * sgn, s.y + uy * len * t + ny * sw * hw * sgn);
    return [...prof.map(([t, hw]) => at(t, hw, 1)), ...prof.map(([t, hw]) => at(t, hw, -1)).reverse()];
  };
  const headPts = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    return pt(cx + Math.cos(a) * headRx * (Math.sin(a) > 0 ? 0.9 : 1), headCy + Math.sin(a) * headRy);
  });
  const parts: Part[] = [
    part(armPts(1), sw * 0.1), part(armPts(-1), sw * 0.1), part(legPts(1), sw * 0.3), part(legPts(-1), sw * 0.3),
    torso, part(headPts, headRx),
  ];

  const tile = new Uint8ClampedArray(4 * 4 * 4); // ivory fibreglass
  for (let i = 0; i < 16; i++) { tile[i * 4] = 240; tile[i * 4 + 1] = 234; tile[i * 4 + 2] = 226; tile[i * 4 + 3] = 255; }
  const bw = b.bust.r - b.bust.l;
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d', { willReadFrequently: true })!;
  for (const p of parts) {
    // work inside the part's own bounding box: far fewer pixels than the whole figure
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of p.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const pad = 6, ox = Math.floor(x0 * scale) - pad, oy = Math.floor(y0 * scale) - pad;
    const w = Math.ceil((x1 - x0) * scale) + pad * 2, h = Math.ceil((y1 - y0) * scale) + pad * 2;
    layer.width = w; layer.height = h;
    lctx.setTransform(scale, 0, 0, scale, -ox, -oy);
    lctx.fillStyle = '#fff';
    lctx.fill(p.path);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    const m = lctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = m[i * 4 + 3];
    const px = shadePixels({
      w, h, alpha, R: p.R * scale, folds: [],
      bumps: p.bust ? [-1, 1].map((sd) => ({ x: (cx + sd * bw * 0.23) * scale - ox, y: (b.bust.y + bw * 0.03) * scale - oy, r: bw * 0.17 * scale, a: 0.5 })) : [],
      tile, tw: 4, th: 4, ox: 0, oy: 0, ts: 0.25, warp: 0, sheen: 0.45, mode: 'satin',
    });
    lctx.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
    ctx.drawImage(layer, ox, oy);
  }
  layer.width = 0;
  return c;
}
