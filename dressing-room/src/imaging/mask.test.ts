import { describe, expect, it } from 'vitest';
import { alphaBBox, fitWithin, plainBackgroundAlpha } from './mask';

function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(paint(x, y), (y * w + x) * 4);
  return d;
}

describe('alphaBBox', () => {
  it('finds the visible rectangle', () => {
    const d = image(10, 8, (x, y) => [0, 0, 0, x >= 2 && x <= 5 && y >= 3 && y <= 6 ? 255 : 0]);
    expect(alphaBBox(d, 10, 8)).toEqual({ x: 2, y: 3, w: 4, h: 4 });
  });
  it('returns null for a fully transparent image', () => {
    expect(alphaBBox(image(4, 4, () => [0, 0, 0, 0]), 4, 4)).toBeNull();
  });
});

describe('plainBackgroundAlpha', () => {
  it('removes a white border but keeps an enclosed white area', () => {
    // 9x9 white image, red ring (2..6) with a white pixel hole in the middle
    const d = image(9, 9, (x, y) => {
      const ring = x >= 2 && x <= 6 && y >= 2 && y <= 6 && !(x === 4 && y === 4);
      return ring ? [200, 20, 30, 255] : [255, 255, 255, 255];
    });
    const a = plainBackgroundAlpha(d, 9, 9, 40);
    expect(a[0]).toBe(0); // corner background
    expect(a[3 * 9 + 3]).toBe(255); // ring interior
    expect(a[4 * 9 + 4]).toBe(255); // enclosed white stays
    expect(a[2 * 9 + 2]).toBeGreaterThan(0); // soft edge on the ring border
    expect(a[2 * 9 + 2]).toBeLessThan(255);
  });
});

describe('fitWithin', () => {
  it('caps the long side and never upscales', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ w: 2048, h: 1536 });
    expect(fitWithin(300, 200, 2048)).toEqual({ w: 300, h: 200 });
  });
});
