import { describe, expect, it } from 'vitest';
import { CANONICAL, CANONICAL_SIZE, DEFAULT_CALIBRATION, deriveBody } from './body';
import { generate, hemYOf } from './generate';
import { allowedSleeves, fromTemplate, HEM_STOPS, normalizeDesign, TEMPLATE_IDS } from './templates';
import type { GarmentGeometry, Neckline, Sleeves } from './types';

const NECKS: Neckline[] = ['v', 'round', 'strapless', 'offShoulder', 'halter'];
const SLEEVES: Sleeves[] = ['none', 'spaghetti', 'short', 'puff', 'long'];

function check(g: GarmentGeometry, label: string) {
  expect(g.pieces.length, label).toBeGreaterThan(0);
  for (const p of g.pieces) {
    expect(p.d.startsWith('M'), `${label} ${p.id} starts with M`).toBe(true);
    expect(p.d.trimEnd().endsWith('Z'), `${label} ${p.id} is closed`).toBe(true);
    expect(/NaN|Infinity|undefined/.test(p.d), `${label} ${p.id} has only finite numbers`).toBe(false);
    for (const f of p.folds) expect(Number.isFinite(f.a.x + f.a.y + f.b.x + f.b.y + f.width), `${label} fold`).toBe(true);
  }
  for (const v of [g.bbox.x, g.bbox.y, g.bbox.w, g.bbox.h]) expect(Number.isFinite(v), `${label} bbox`).toBe(true);
  expect(g.bbox.w, label).toBeGreaterThan(20);
  expect(g.bbox.h, label).toBeGreaterThan(20);
  // nothing should fly far outside the croquis
  expect(g.bbox.x, label).toBeGreaterThan(-CANONICAL_SIZE.w);
  expect(g.bbox.x + g.bbox.w, label).toBeLessThan(CANONICAL_SIZE.w * 2);
}

describe('pattern engine', () => {
  it('every template × neckline × sleeve × length × slit gives closed, finite paths', () => {
    let n = 0;
    for (const t of TEMPLATE_IDS) for (const neckline of NECKS) for (const sleeves of SLEEVES) {
      for (const hem of [0, ...Object.values(HEM_STOPS), 1]) for (const slit of [null, { side: 'left' as const, height: 0.6 }, { side: 'center' as const, height: 0.9 }]) {
        const d = { ...fromTemplate(t), neckline, sleeves, hem, slit, seed: 3 };
        check(generate(d, CANONICAL), `${t}/${neckline}/${sleeves}/${hem}`);
        n++;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('survives extreme parameters and a non-canonical body', () => {
    const body = deriveBody(DEFAULT_CALIBRATION, 820, 2010);
    for (const t of TEMPLATE_IDS) for (const v of [0, 1]) {
      const d = { ...fromTemplate(t), waistFit: v, ease: v * 0.3, flare: v, neckDepth: v, hem: v };
      check(generate(d, body), `${t} extreme ${v}`);
    }
  });

  it('is deterministic for a given seed', () => {
    const d = { ...fromTemplate('aline'), seed: 42 };
    expect(generate(d, CANONICAL)).toEqual(generate(d, CANONICAL));
  });

  it('longer hem and more flare change the silhouette the right way', () => {
    const d = fromTemplate('aline');
    expect(hemYOf({ ...d, hem: 0.9 }, CANONICAL)).toBeGreaterThan(hemYOf({ ...d, hem: 0.2 }, CANONICAL));
    const narrow = generate({ ...d, flare: 0 }, CANONICAL).bbox.w, wide = generate({ ...d, flare: 1 }, CANONICAL).bbox.w;
    expect(wide).toBeGreaterThan(narrow);
  });

  it('repairs combinations that cannot be sewn', () => {
    const d = normalizeDesign({ ...fromTemplate('mermaid'), neckline: 'strapless', sleeves: 'long' });
    expect(d.sleeves).toBe('none');
    expect(allowedSleeves('dress', 'halter')).toEqual(['none']);
    expect(normalizeDesign({ ...fromTemplate('pants'), slit: { side: 'left', height: 0.5 } }).slit).toBeNull();
    expect(normalizeDesign({ ...fromTemplate('aline'), hem: 0.1, slit: { side: 'left', height: 0.5 } }).slit).toBeNull();
  });
});
