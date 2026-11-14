import { describe, expect, it } from 'vitest';
import { autoCalibrate, fitGarment, fitScaleAt, type AlphaMap } from './autoFit';
import { deriveBody } from './body';

/** Draw filled rows: spans(y) returns [l, r] pairs in 0..1 of the width. */
function draw(w: number, h: number, spans: (v: number) => [number, number][]): AlphaMap {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (const [l, r] of spans(y / h)) {
    for (let x = Math.round(l * w); x < Math.round(r * w); x++) data[y * w + x] = 255;
  }
  return { w, h, data };
}
const person = (armsApart: boolean) => draw(200, 400, (v) => {
  if (v < 0.11) return [[0.42, 0.58]]; // head
  if (v < 0.15) return [[0.46, 0.54]]; // neck
  const arms: [number, number][] = v < 0.5 ? (armsApart ? [[0.18, 0.26], [0.74, 0.82]] : [[0.25, 0.31], [0.69, 0.75]]) : [];
  if (v < 0.2) return [[0.2, 0.8]]; // shoulders (arms attached)
  if (v < 0.42) { const t = (v - 0.2) / 0.22; const half = 0.19 - 0.05 * Math.sin(Math.PI * Math.min(1, t)); return [...arms, [0.5 - half, 0.5 + half]]; }
  if (v < 0.56) { const half = 0.15 + 0.05 * Math.sin(Math.PI * (v - 0.42) / 0.14 * 0.5); return [...arms, [0.5 - half, 0.5 + half]]; }
  return [[0.32, 0.47], [0.53, 0.68]]; // legs
});

describe('autoCalibrate', () => {
  it('finds the landmarks of a standing figure with the arms apart', () => {
    const c = autoCalibrate(person(true))!;
    expect(c).not.toBeNull();
    expect(c.shoulderL.y).toBeGreaterThan(0.14); expect(c.shoulderL.y).toBeLessThan(0.23);
    expect(c.shoulderR.x - c.shoulderL.x).toBeGreaterThan(0.45);
    expect(c.waistL.y).toBeGreaterThan(0.27); expect(c.waistL.y).toBeLessThan(0.42);
    expect(c.waistR.x - c.waistL.x).toBeLessThan(c.shoulderR.x - c.shoulderL.x); // waist narrower than shoulders
    expect(c.hipL.y).toBeGreaterThan(c.waistL.y);
    expect(c.hipR.x - c.hipL.x).toBeGreaterThan(c.waistR.x - c.waistL.x);
    expect(c.ankleL.x).toBeLessThan(0.5); expect(c.ankleR.x).toBeGreaterThan(0.5);
    expect(c.wristL.x).toBeLessThan(c.waistL.x); expect(c.wristR.x).toBeGreaterThan(c.waistR.x);
  });
  it('keeps the torso plausible when the arms rest against the body', () => {
    const c = autoCalibrate(person(false))!;
    expect(c.waistR.x - c.waistL.x).toBeLessThanOrEqual((c.shoulderR.x - c.shoulderL.x) * 0.9);
  });
  it('refuses silhouettes that are not a person', () => {
    expect(autoCalibrate(draw(100, 200, () => [[0.1, 0.9]]))).toBeNull(); // a rectangle
    expect(autoCalibrate({ w: 10, h: 10, data: new Uint8Array(100) })).toBeNull();
  });
});

describe('fitGarment', () => {
  const body = deriveBody(autoCalibrate(person(true))!, 600, 1200);
  // dress: bodice narrower than the body, waist at 35% of its height, flared skirt
  const dress = draw(120, 200, (v) => {
    if (v < 0.35) return [[0.5 - lerp(0.3, 0.16, v / 0.35), 0.5 + lerp(0.3, 0.16, v / 0.35)]];
    return [[0.5 - lerp(0.16, 0.5, (v - 0.35) / 0.65), 0.5 + lerp(0.16, 0.5, (v - 0.35) / 0.65)]];
  });
  function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  it('puts the waist of a dress on her waist and centres it', () => {
    const p = fitGarment(dress, 0.6, 'dress', body, 600, 1200)!;
    expect(p).not.toBeNull();
    const top = p.y * 1200 - (p.scale * 1200) / 2;
    expect(top + 0.35 * p.scale * 1200).toBeCloseTo(body.waist.y, -1); // within ~5px
    expect(top).toBeLessThan(body.shoulder.y); expect(top).toBeGreaterThan(body.neck.y);
    expect(p.x * 600).toBeCloseTo((body.waist.l + body.waist.r) / 2, 0);
    expect(p.stretchX).toBeGreaterThanOrEqual(0.85); expect(p.stretchX).toBeLessThanOrEqual(1.18);
  });
  it('hangs a skirt from the waist', () => {
    const skirt = draw(100, 100, (v) => [[0.5 - lerp(0.25, 0.5, v), 0.5 + lerp(0.25, 0.5, v)]]);
    const p = fitGarment(skirt, 1, 'skirt', body, 600, 1200)!;
    const top = p.y * 1200 - (p.scale * 1200) / 2;
    expect(top).toBeLessThan(body.waist.y); expect(top).toBeGreaterThan(body.waist.y - 40);
  });
  it('full-length trousers reach the ankles', () => {
    const pants = draw(60, 200, (v) => (v < 0.25 ? [[0.1, 0.9]] : [[0.1, 0.46], [0.54, 0.9]]));
    const p = fitGarment(pants, 0.3, 'pants', body, 600, 1200)!;
    expect(p.y * 1200 + (p.scale * 1200) / 2).toBeCloseTo(body.ankle.y, -2);
  });
  it('leaves shoes and accessories to the default placement', () => {
    expect(fitGarment(dress, 1, 'shoes', body, 600, 1200)).toBeNull();
  });
  it('interpolates the row profile', () => {
    expect(fitScaleAt([], 0.3)).toBe(1);
    expect(fitScaleAt([1, 1.2], 0)).toBe(1);
    expect(fitScaleAt([1, 1.2], 1)).toBe(1.2);
    expect(fitScaleAt([1, 1.2], 0.5)).toBeCloseTo(1.1, 5);
  });
});
