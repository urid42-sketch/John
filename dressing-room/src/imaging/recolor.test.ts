import { describe, expect, it } from 'vitest';
import { applyFabricPixels, hexToRgb, recolor, warpRowScale } from './recolor';

const px = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());

describe('recolor', () => {
  it('colorizes a white garment to red while keeping the shading order', () => {
    const p = px([250, 250, 250, 255], [200, 200, 200, 255], [0, 0, 0, 0]);
    recolor(p, { mode: 'colorize', color: [200, 20, 40], hue: 0, saturation: 0, strength: 1 });
    expect(p[0]).toBeGreaterThan(p[1] + 40); // red dominates
    expect(p[0] + p[1] + p[2]).toBeGreaterThan(p[4] + p[5] + p[6]); // lighter pixel stays lighter
    expect([...p.slice(8)]).toEqual([0, 0, 0, 0]); // transparent pixel untouched
  });
  it('colorizes black toward a light colour (not stuck at black)', () => {
    const p = px([10, 10, 10, 255], [30, 30, 30, 255]);
    recolor(p, { mode: 'colorize', color: [240, 180, 200], hue: 0, saturation: 0, strength: 1 });
    expect(p[0]).toBeGreaterThan(150);
  });
  it('hue shift rotates red to green and respects the selection', () => {
    const p = px([220, 30, 30, 255], [220, 30, 30, 255]);
    const sel = px([0, 0, 0, 255], [0, 0, 0, 0]);
    recolor(p, { mode: 'shift', color: [0, 0, 0], hue: 120, saturation: 0, strength: 1 }, sel);
    expect(p[1]).toBeGreaterThan(p[0]);
    expect([...p.slice(4, 7)]).toEqual([220, 30, 30]);
  });
  it('strength 0 changes nothing', () => {
    const p = px([12, 99, 180, 255]);
    recolor(p, { mode: 'shift', color: [0, 0, 0], hue: 90, saturation: 0.5, strength: 0 });
    expect([...p]).toEqual([12, 99, 180, 255]);
  });
});

describe('applyFabricPixels', () => {
  it('takes the fabric colour, keeps alpha and the light/dark relation', () => {
    const g = px([200, 200, 200, 255], [100, 100, 100, 255], [50, 50, 50, 0]);
    const f = px([40, 80, 160, 255], [40, 80, 160, 255], [40, 80, 160, 255]);
    applyFabricPixels(g, f);
    expect(g[2]).toBeGreaterThan(g[0]); // blue fabric
    expect(g[2]).toBeGreaterThan(g[6]); // lighter area stays lighter
    expect(g[11]).toBe(0);
  });
});

describe('helpers', () => {
  it('warp scale narrows the waist and widens the hem', () => {
    expect(warpRowScale(0.4, 0.15, 0.4, 0)).toBeCloseTo(0.85, 5);
    expect(warpRowScale(0.05, 0.15, 0.4, 0)).toBeGreaterThan(0.99);
    expect(warpRowScale(1, 0, 0.4, 0.2)).toBeCloseTo(1.2, 5);
    expect(warpRowScale(0.3, 0, 0.4, 0.2)).toBe(1);
  });
  it('parses hex colours', () => { expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]); });
});
