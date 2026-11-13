import type { Pt } from '../db/types';

/** Item transform in stage pixels: centre, uniform scale multiplier, rotation in degrees. */
export interface Xf { x: number; y: number; scale: number; rotation: number }

/**
 * Two-finger transform: the fingers started at (a0,b0) and are now at (a1,b1). The item follows
 * the fingers: translate with the centroid, scale with their distance, rotate with their angle,
 * all about the centroid (so the point under the fingers stays under them).
 */
export function pinchTransform(start: Xf, a0: Pt, b0: Pt, a1: Pt, b1: Pt): Xf {
  const c0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y) || 1;
  const r = d1 / d0;
  const da = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
  const vx = start.x - c0.x, vy = start.y - c0.y;
  const cos = Math.cos(da), sin = Math.sin(da);
  return {
    x: c1.x + (vx * cos - vy * sin) * r,
    y: c1.y + (vx * sin + vy * cos) * r,
    scale: start.scale * r,
    rotation: normalizeDeg(start.rotation + (da * 180) / Math.PI),
  };
}

export function normalizeDeg(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
}

/** Point (stage px) → item-local unit coords (0..1 across the item's box), undoing rotation and flip. */
export function toLocalUnit(
  p: Pt, center: Pt, width: number, height: number, rotationDeg: number, flipX: boolean,
): Pt {
  const a = (-rotationDeg * Math.PI) / 180;
  const dx = p.x - center.x, dy = p.y - center.y;
  const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / width + 0.5;
  const ly = (dx * Math.sin(a) + dy * Math.cos(a)) / height + 0.5;
  return { x: flipX ? 1 - lx : lx, y: ly };
}

export interface AlphaMap { w: number; h: number; data: Uint8Array }

/** True when the unit point lands on (or within `slop` of) a visible pixel of the alpha map. */
export function hitsAlpha(map: AlphaMap | undefined, u: Pt, slopX = 0.04, slopY = slopX): boolean {
  if (u.x < -slopX || u.x > 1 + slopX || u.y < -slopY || u.y > 1 + slopY) return false;
  if (!map) return true;
  const sx = slopX, sy = slopY;
  for (const [ox, oy] of [[0, 0], [sx, 0], [-sx, 0], [0, sy], [0, -sy], [sx / 2, sy / 2], [-sx / 2, sy / 2], [sx / 2, -sy / 2], [-sx / 2, -sy / 2]]) {
    const x = Math.round((u.x + ox) * (map.w - 1)), y = Math.round((u.y + oy) * (map.h - 1));
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
    if (map.data[y * map.w + x] > 24) return true;
  }
  return false;
}
