import { presetFabric } from './fabricPresets';
import type { Fabric, GarmentDesign, GarmentType, Neckline, Sleeves, TemplateId } from './types';

export const TEMPLATE_IDS: TemplateId[] = ['aline', 'bodycon', 'mermaid', 'maxi', 'skirt', 'top', 'pants'];
export const HEM_STOPS = { mini: 0.15, knee: 0.47, midi: 0.7, maxi: 0.97 } as const;

export const defaultFabric = (): Fabric => ({
  kind: 'satin', colors: ['#b9797c', '#f4ece4', '#3b302c'], scale: 1, sheen: 0.5, sequins: 0,
});

const base = (): GarmentDesign => ({
  engineVersion: 1, template: 'aline', type: 'dress', profile: 'aline',
  hem: HEM_STOPS.knee, neckline: 'round', neckDepth: 0.4, sleeves: 'none',
  waistFit: 0.9, ease: 0.04, flare: 0.35, slit: null,
  fabric: defaultFabric(), details: [], seed: 7,
});

const PRESETS: Record<TemplateId, Partial<GarmentDesign>> = {
  aline: { type: 'dress', profile: 'aline', flare: 0.4, hem: HEM_STOPS.knee, neckline: 'round', sleeves: 'short' },
  bodycon: { type: 'dress', profile: 'fitted', flare: 0, ease: 0.02, waistFit: 1, hem: 0.36, neckline: 'v', neckDepth: 0.5 },
  mermaid: { type: 'dress', profile: 'mermaid', flare: 0.55, ease: 0.02, waistFit: 1, hem: HEM_STOPS.maxi, neckline: 'strapless' },
  maxi: { type: 'dress', profile: 'aline', flare: 0.25, waistFit: 0.75, hem: HEM_STOPS.maxi, neckline: 'v', neckDepth: 0.55, sleeves: 'spaghetti' },
  skirt: { type: 'skirt', profile: 'aline', flare: 0.35, hem: 0.42 },
  top: { type: 'top', profile: 'fitted', flare: 0, waistFit: 0.6, ease: 0.06, hem: 0.55, neckline: 'round', sleeves: 'short' },
  pants: { type: 'pants', profile: 'fitted', flare: 0.1, ease: 0.08, hem: HEM_STOPS.maxi },
};

/** The cloth each pattern is first shown in: chosen so every starting point looks good. */
export const TEMPLATE_CLOTH: Record<TemplateId, string> = {
  aline: 'floralPink', bodycon: 'velvetWine', mermaid: 'satinEmerald', maxi: 'satinChampagne', skirt: 'plaidRed', top: 'linenWhite', pants: 'denimDark',
};

export function fromTemplate(t: TemplateId): GarmentDesign {
  return normalizeDesign({ ...base(), ...PRESETS[t], fabric: presetFabric(TEMPLATE_CLOTH[t]), template: t, seed: 1 + Math.floor(Math.random() * 1e6) });
}

/** Which options make sense together; the UI greys out the rest. */
export function allowedSleeves(type: GarmentType, neckline: Neckline): Sleeves[] {
  if (type === 'skirt' || type === 'pants') return [];
  if (neckline === 'strapless') return ['none', 'spaghetti'];
  if (neckline === 'offShoulder' || neckline === 'halter') return ['none'];
  return ['none', 'spaghetti', 'short', 'puff', 'long'];
}
export const hasNeckline = (type: GarmentType) => type === 'dress' || type === 'top';
export const hasSlit = (d: Pick<GarmentDesign, 'type' | 'hem'>) => (d.type === 'dress' || d.type === 'skirt') && d.hem > 0.3;
export const hasProfile = (type: GarmentType) => type === 'dress' || type === 'skirt';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** Clamp every parameter and repair combinations that cannot be sewn. Pure. */
export function normalizeDesign(d: GarmentDesign): GarmentDesign {
  const out: GarmentDesign = {
    ...d,
    hem: clamp(d.hem, 0, 1), neckDepth: clamp(d.neckDepth, 0, 1), waistFit: clamp(d.waistFit, 0, 1),
    ease: clamp(d.ease, 0, 0.3), flare: clamp(d.flare, 0, 1),
    fabric: { ...d.fabric, scale: clamp(d.fabric.scale, 0.3, 3), sheen: clamp(d.fabric.sheen, 0, 1), sequins: clamp(d.fabric.sequins, 0, 1) },
  };
  if (!hasProfile(out.type)) out.profile = 'fitted';
  const sleeves = allowedSleeves(out.type, out.neckline);
  if (!sleeves.includes(out.sleeves)) out.sleeves = 'none';
  if (!hasSlit(out)) out.slit = null;
  else if (out.slit) out.slit = { side: out.slit.side, height: clamp(out.slit.height, 0.1, 0.9) };
  return out;
}

/** Stored designs pass through here on read, so old saves keep working after engine changes. */
export function migrateDesign(raw: unknown): GarmentDesign {
  const d = raw as GarmentDesign;
  return normalizeDesign({ ...base(), ...d, fabric: { ...defaultFabric(), ...d.fabric }, details: d.details ?? [] });
}
