import type { Body, BodyCalibration, Level } from './types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Reference croquis, 600×1000. Designs are stored and thumbnailed on this body. */
export const CANONICAL_SIZE = { w: 600, h: 1000 };
export const CANONICAL_CALIBRATION: BodyCalibration = {
  shoulderL: { x: 215 / 600, y: 0.185 }, shoulderR: { x: 385 / 600, y: 0.185 },
  waistL: { x: 245 / 600, y: 0.38 }, waistR: { x: 355 / 600, y: 0.38 },
  hipL: { x: 218 / 600, y: 0.47 }, hipR: { x: 382 / 600, y: 0.47 },
  ankleL: { x: 274 / 600, y: 0.9 }, ankleR: { x: 326 / 600, y: 0.9 },
  wristL: { x: 150 / 600, y: 0.48 }, wristR: { x: 450 / 600, y: 0.48 },
};

/**
 * Starting guess for a freshly imported doll photo (fractions of the trimmed cutout):
 * a frontal standing pose with the arms slightly away from the body.
 */
export const DEFAULT_CALIBRATION: BodyCalibration = {
  shoulderL: { x: 0.3, y: 0.19 }, shoulderR: { x: 0.7, y: 0.19 },
  waistL: { x: 0.37, y: 0.39 }, waistR: { x: 0.63, y: 0.39 },
  hipL: { x: 0.32, y: 0.49 }, hipR: { x: 0.68, y: 0.49 },
  ankleL: { x: 0.42, y: 0.94 }, ankleR: { x: 0.58, y: 0.94 },
  wristL: { x: 0.12, y: 0.5 }, wristR: { x: 0.88, y: 0.5 },
};

/** Full body model from the ten calibration points; everything else uses fixed proportions. */
export function deriveBody(c: BodyCalibration, w: number, h: number): Body {
  const X = (v: number) => v * w, Y = (v: number) => v * h;
  const level = (a: { x: number; y: number }, b: { x: number; y: number }): Level => ({
    y: (Y(a.y) + Y(b.y)) / 2, l: Math.min(X(a.x), X(b.x)), r: Math.max(X(a.x), X(b.x)),
  });
  const shoulder = level(c.shoulderL, c.shoulderR);
  const waist = level(c.waistL, c.waistR);
  const hip = level(c.hipL, c.hipR);
  const ankleC = level(c.ankleL, c.ankleR);
  // Keep the levels ordered even if the dots were dragged carelessly.
  waist.y = Math.max(waist.y, shoulder.y + 10);
  hip.y = Math.max(hip.y, waist.y + 10);
  ankleC.y = Math.max(ankleC.y, hip.y + 40);

  const H = ankleC.y - shoulder.y;
  const sw = shoulder.r - shoulder.l, hipW = hip.r - hip.l;
  const sMid = (shoulder.l + shoulder.r) / 2;
  const cx = (hip.l + hip.r) / 2;
  const centered = (y: number, mid: number, width: number): Level => ({ y, l: mid - width / 2, r: mid + width / 2 });

  const neck = centered(shoulder.y - 0.049 * H, sMid, 0.26 * sw);
  const underarm = centered(lerp(shoulder.y, waist.y, 0.34), lerp(sMid, (waist.l + waist.r) / 2, 0.34), 0.8 * sw);
  const bust = centered(
    lerp(shoulder.y, waist.y, 0.52), lerp(sMid, (waist.l + waist.r) / 2, 0.52),
    Math.max(0.85 * sw, 1.05 * (waist.r - waist.l)),
  );
  const aw = 0.1 * hipW;
  const ankle: Level = { y: ankleC.y, l: ankleC.l - aw, r: ankleC.r + aw };
  const innerAnkle = { l: Math.min(ankleC.l + aw, cx - 2), r: Math.max(ankleC.r - aw, cx + 2) };
  const knee: Level = { y: lerp(hip.y, ankle.y, 0.51), l: lerp(hip.l, ankle.l, 0.5), r: lerp(hip.r, ankle.r, 0.5) };
  const innerKnee = {
    l: Math.min(lerp(cx, innerAnkle.l, 0.5) - 0.06 * hipW, cx - 2),
    r: Math.max(lerp(cx, innerAnkle.r, 0.5) + 0.06 * hipW, cx + 2),
  };
  const [wl, wr] = c.wristL.x <= c.wristR.x ? [c.wristL, c.wristR] : [c.wristR, c.wristL];
  return {
    neck, shoulder, underarm, bust, waist, hip,
    crotchY: hip.y + 0.07 * H, knee, ankle, innerKnee, innerAnkle,
    floorY: ankle.y + 0.05 * H, cx,
    wristL: { x: X(wl.x), y: Y(wl.y) }, wristR: { x: X(wr.x), y: Y(wr.y) },
  };
}

export const CANONICAL: Body = deriveBody(CANONICAL_CALIBRATION, CANONICAL_SIZE.w, CANONICAL_SIZE.h);

/** Outer silhouette at height y, from the underarm down to the ankles. */
export function bodyRowAt(b: Body, y: number): { l: number; r: number } {
  const levels = [b.underarm, b.bust, b.waist, b.hip, b.knee, b.ankle];
  if (y <= levels[0].y) return { l: levels[0].l, r: levels[0].r };
  for (let i = 1; i < levels.length; i++) {
    const p = levels[i - 1], q = levels[i];
    if (y <= q.y) {
      const t = (y - p.y) / (q.y - p.y || 1);
      // ease the joints a little so the side line reads as a curve, not a polygon
      const s = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      return { l: lerp(p.l, q.l, s), r: lerp(p.r, q.r, s) };
    }
  }
  return { l: b.ankle.l, r: b.ankle.r };
}
