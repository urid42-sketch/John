import { shade as shadePixels } from './shade';
import type { Body } from './types';

/** Soft dress-form figure, lit like the garments, drawn in garment units under the clothes. */
export function renderMannequin(b: Body, width: number, height: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(width * scale)); c.height = Math.max(1, Math.ceil(height * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const sw = b.shoulder.r - b.shoulder.l;
  const headR = (b.neck.r - b.neck.l) * 0.95, cx = (b.neck.l + b.neck.r) / 2;
  const parts: { path: Path2D; R: number }[] = [];
  const poly = (pts: [number, number][]) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };

  const torso = poly([
    [b.neck.l, b.neck.y], [b.shoulder.l, b.shoulder.y], [b.underarm.l, b.underarm.y], [b.bust.l, b.bust.y], [b.waist.l, b.waist.y], [b.hip.l, b.hip.y],
    [b.cx - (b.hip.r - b.hip.l) * 0.02, b.crotchY + 6], [b.hip.r, b.hip.y], [b.waist.r, b.waist.y], [b.bust.r, b.bust.y], [b.underarm.r, b.underarm.y],
    [b.shoulder.r, b.shoulder.y], [b.neck.r, b.neck.y],
  ]);
  parts.push({ path: torso, R: sw * 0.5 });
  const leg = (s: -1 | 1) => {
    const outer = s < 0 ? 'l' : 'r', inner = s < 0 ? 'l' : 'r';
    return poly([
      [b.hip[outer], b.hip.y], [b.knee[outer], b.knee.y], [b.ankle[outer], b.ankle.y], [b.ankle[outer], b.floorY],
      [b.innerAnkle[inner], b.floorY], [b.innerAnkle[inner], b.ankle.y], [b.innerKnee[inner], b.knee.y], [b.cx + s * 2, b.crotchY - 20], [b.cx + s * 2, b.hip.y],
    ]);
  };
  parts.push({ path: leg(-1), R: sw * 0.3 }, { path: leg(1), R: sw * 0.3 });
  const arm = (sx: number, sy: number, wx: number, wy: number) => {
    const dx = wx - sx, dy = wy - sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, t = sw * 0.075, t2 = sw * 0.05;
    return poly([[sx + nx * t, sy + ny * t], [wx + nx * t2, wy + ny * t2], [wx - nx * t2, wy - ny * t2], [sx - nx * t, sy - ny * t]]);
  };
  parts.push({ path: arm(b.shoulder.l + 4, b.shoulder.y + 6, b.wristL.x, b.wristL.y), R: sw * 0.12 });
  parts.push({ path: arm(b.shoulder.r - 4, b.shoulder.y + 6, b.wristR.x, b.wristR.y), R: sw * 0.12 });
  const neck = poly([[b.neck.l, b.neck.y - headR * 0.9], [b.neck.r, b.neck.y - headR * 0.9], [b.neck.r, b.neck.y + 6], [b.neck.l, b.neck.y + 6]]);
  parts.push({ path: neck, R: sw * 0.1 });
  const head = new Path2D(); head.ellipse(cx, b.neck.y - headR * 1.25, headR, headR * 1.25, 0, 0, Math.PI * 2);
  parts.push({ path: head, R: headR });

  const acc = document.createElement('canvas'); // parts are stacked here in order
  acc.width = c.width; acc.height = c.height;
  const actx = acc.getContext('2d')!;
  // one tile of fine matte weave in a warm neutral
  const tile = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) { tile[i * 4] = 226 + (i % 3); tile[i * 4 + 1] = 208 + (i % 2); tile[i * 4 + 2] = 192; tile[i * 4 + 3] = 255; }
  for (const part of parts) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.fillStyle = '#fff'; ctx.fill(part.path);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const m = ctx.getImageData(0, 0, c.width, c.height).data;
    const alpha = new Uint8ClampedArray(c.width * c.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = m[i * 4 + 3];
    const px = shadePixels({
      w: c.width, h: c.height, alpha, R: part.R * scale, folds: [], bumps: [], tile, tw: 4, th: 4, ox: 0, oy: 0, ts: 0.25, warp: 0, sheen: 0.3, mode: 'matte',
    });
    const layer = document.createElement('canvas'); layer.width = c.width; layer.height = c.height;
    layer.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), c.width, c.height), 0, 0);
    actx.drawImage(layer, 0, 0);
    layer.width = 0;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(acc, 0, 0);
  acc.width = 0;
  return c;
}
