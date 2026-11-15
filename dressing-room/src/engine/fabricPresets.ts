import type { Fabric } from './types';

export interface FabricPreset { id: string; fabric: Fabric }
const f = (kind: Fabric['kind'], colors: string[], sheen: number, scale = 1, sequins = 0): Fabric => ({ kind, colors, sheen, scale, sequins });

/** Ready-made cloths, one tap each. Names live in i18n (he.studio.presets). */
export const FABRIC_PRESETS: FabricPreset[] = [
  { id: 'satinRed', fabric: f('satin', ['#a3162e'], 0.8) },
  { id: 'satinEmerald', fabric: f('satin', ['#126a4a'], 0.8) },
  { id: 'satinChampagne', fabric: f('satin', ['#e6cdaa'], 0.85) },
  { id: 'satinBlush', fabric: f('satin', ['#e9b9bd'], 0.75) },
  { id: 'velvetWine', fabric: f('velvet', ['#6a1230'], 0.7) },
  { id: 'velvetNavy', fabric: f('velvet', ['#18244f'], 0.7) },
  { id: 'laceIvory', fabric: f('lace', ['#f3ebdd'], 0.2, 1) },
  { id: 'laceBlack', fabric: f('lace', ['#1b191b'], 0.2, 1) },
  { id: 'printPeony', fabric: { kind: 'image', colors: ['#f7ecdc'], image: 'builtin:peony', sheen: 0.2, scale: 1.3, sequins: 0 } },
  { id: 'printDitsy', fabric: { kind: 'image', colors: ['#1f2b55'], image: 'builtin:ditsy', sheen: 0.15, scale: 1, sequins: 0 } },
  { id: 'printBotanical', fabric: { kind: 'image', colors: ['#f8f3df'], image: 'builtin:botanical', sheen: 0.35, scale: 1.3, sequins: 0 } },
  { id: 'floralPink', fabric: f('floral', ['#f4e4e0', '#d4627c', '#4d7858'], 0.15, 1) },
  { id: 'floralNavy', fabric: f('floral', ['#1d2c52', '#f2dccb', '#5f8c6c'], 0.15, 1) },
  { id: 'denimBlue', fabric: f('denim', ['#3d5c92'], 0.1) },
  { id: 'denimDark', fabric: f('denim', ['#232e4c'], 0.1) },
  { id: 'plaidRed', fabric: f('plaid', ['#7a1c28', '#f1e6d4', '#161616'], 0.1, 1.2) },
  { id: 'plaidGreen', fabric: f('plaid', ['#1f4a3a', '#d9c9a0', '#101a14'], 0.1, 1.2) },
  { id: 'linenSand', fabric: f('linen', ['#d9c8a9'], 0.1) },
  { id: 'linenWhite', fabric: f('linen', ['#f2ede3'], 0.1) },
  { id: 'cottonSky', fabric: f('solid', ['#a7c6e6'], 0.15) },
  { id: 'sequinGold', fabric: f('satin', ['#c9a24a'], 0.9, 1, 0.85) },
];

export const presetFabric = (id: string): Fabric => {
  const p = FABRIC_PRESETS.find((x) => x.id === id) ?? FABRIC_PRESETS[0];
  return { ...p.fabric, colors: [...p.fabric.colors] };
};
