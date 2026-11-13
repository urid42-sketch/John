import { describe, expect, it } from 'vitest';
import { hitsAlpha, normalizeDeg, pinchTransform, toLocalUnit } from './gesture';

const start = { x: 100, y: 100, scale: 0.5, rotation: 0 };
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('pinchTransform', () => {
  it('pure pan moves the item with the centroid', () => {
    const r = pinchTransform(start, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 7 }, { x: 15, y: 7 });
    near(r.x, 105); near(r.y, 107); near(r.scale, 0.5); near(r.rotation, 0);
  });
  it('spreading fingers scales about the centroid', () => {
    // centroid (100,200) stays; item centre is 100px above it → 200px above after 2x
    const r = pinchTransform(start, { x: 90, y: 200 }, { x: 110, y: 200 }, { x: 80, y: 200 }, { x: 120, y: 200 });
    near(r.scale, 1); near(r.x, 100); near(r.y, 0);
  });
  it('twisting fingers rotates about the centroid', () => {
    const r = pinchTransform(start, { x: 90, y: 100 }, { x: 110, y: 100 }, { x: 100, y: 90 }, { x: 100, y: 110 });
    near(r.rotation, 90); near(r.x, 100); near(r.y, 100); near(r.scale, 0.5);
  });
  it('keeps the grabbed point under the fingers when rotating off-centre', () => {
    const r = pinchTransform(start, { x: 190, y: 100 }, { x: 210, y: 100 }, { x: 200, y: 90 }, { x: 200, y: 110 });
    near(r.x, 200); near(r.y, 0);
  });
});

describe('helpers', () => {
  it('normalizes degrees into (-180, 180]', () => {
    expect(normalizeDeg(190)).toBe(-170);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(360)).toBe(0);
  });
  it('maps stage points into item-local unit space', () => {
    const c = { x: 50, y: 50 };
    const u = toLocalUnit({ x: 50, y: 30 }, c, 20, 40, 0, false);
    near(u.x, 0.5); near(u.y, 0);
    // item rotated 90° clockwise: its top edge now points right
    const v = toLocalUnit({ x: 70, y: 50 }, c, 20, 40, 90, false);
    near(v.x, 0.5); near(v.y, 0);
    near(toLocalUnit({ x: 45, y: 50 }, c, 20, 40, 0, true).x, 0.75);
  });
  it('hit-tests against transparent pixels', () => {
    const map = { w: 2, h: 1, data: new Uint8Array([255, 0]) };
    expect(hitsAlpha(map, { x: 0.1, y: 0.5 }, 0)).toBe(true);
    expect(hitsAlpha(map, { x: 0.9, y: 0.5 }, 0)).toBe(false);
    expect(hitsAlpha(map, { x: 2, y: 0.5 })).toBe(false);
    expect(hitsAlpha(undefined, { x: 0.9, y: 0.5 })).toBe(true);
  });
});
