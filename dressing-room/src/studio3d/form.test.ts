import { describe, expect, it } from 'vitest';
import { fromTemplate, TEMPLATE_IDS } from '../engine/templates';
import type { Neckline, Sleeves } from '../engine/types';
import { FORM_BOTTOM, formPoint, garmentShell, hasCloth, LEVELS, rowAt } from './form';

describe('dress form', () => {
  it('has a waist narrower than bust and hips, and closes at the bottom', () => {
    expect(rowAt(LEVELS.waist).hw).toBeLessThan(rowAt(LEVELS.bust).hw);
    expect(rowAt(LEVELS.waist).hw).toBeLessThan(rowAt(LEVELS.hip).hw);
    expect(rowAt(FORM_BOTTOM).hw).toBeLessThan(1);
  });
  it('is symmetric left / right and fuller in front at the bust', () => {
    const a = formPoint(LEVELS.bust, 0.6), b = formPoint(LEVELS.bust, -0.6);
    expect(a.x).toBeCloseTo(-b.x, 6); expect(a.z).toBeCloseTo(b.z, 6);
    expect(formPoint(LEVELS.bust, 0.45).z).toBeGreaterThan(-formPoint(LEVELS.bust, Math.PI - 0.45).z);
  });
});

describe('garment shell', () => {
  it('every template gives finite positions that clear the form', () => {
    for (const t of TEMPLATE_IDS) for (const flare of [0, 1]) {
      const s = garmentShell({ ...fromTemplate(t), flare, seed: 3 }, 24, 20);
      for (const row of s.pos) for (const p of row) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      const p = s.pos[2][18];
      const f = formPoint(Math.min(p.y, LEVELS.hip), Math.atan2(p.x, p.z));
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(Math.hypot(f.x, f.z) * 0.98);
    }
  });
  it('a full skirt is wider at the hem than a fitted one', () => {
    const w = (flare: number, profile: 'aline' | 'fitted') => {
      const s = garmentShell({ ...fromTemplate('aline'), flare, profile }, 24, 20);
      return Math.max(...s.pos[s.rows].map((p) => Math.abs(p.x)));
    };
    expect(w(1, 'aline')).toBeGreaterThan(w(0, 'fitted') * 1.4);
  });
});

describe('hasCloth', () => {
  const NECKS: Neckline[] = ['v', 'round', 'strapless', 'offShoulder', 'halter'];
  const SLEEVES: Sleeves[] = ['none', 'spaghetti', 'short', 'puff', 'long'];
  it('always covers the waist and never the top of the neck', () => {
    for (const neckline of NECKS) for (const sleeves of SLEEVES) {
      const d = { ...fromTemplate('aline'), neckline, sleeves };
      expect(hasCloth(d, 0, LEVELS.waist, true), `${neckline}/${sleeves}`).toBe(true);
      expect(hasCloth(d, 30, LEVELS.waist, false)).toBe(true);
      expect(hasCloth(d, 0, LEVELS.neck - 20, true)).toBe(false);
    }
  });
  it('a V neck is open at the centre and closed toward the shoulder', () => {
    const d = { ...fromTemplate('aline'), neckline: 'v' as const, sleeves: 'none' as const, neckDepth: 0.6 };
    expect(hasCloth(d, 0, LEVELS.shoulder + 20, true)).toBe(false);
    expect(hasCloth(d, 50, LEVELS.shoulder + 20, true)).toBe(true);
  });
  it('strapless has bare shoulders; skirts are cloth everywhere', () => {
    const d = { ...fromTemplate('mermaid'), neckline: 'strapless' as const, sleeves: 'none' as const };
    expect(hasCloth(d, 50, LEVELS.shoulder + 10, true)).toBe(false);
    expect(hasCloth(fromTemplate('skirt'), 80, LEVELS.waist, true)).toBe(true);
  });
});
