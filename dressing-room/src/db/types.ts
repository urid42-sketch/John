import type { GarmentDesign } from '../engine/types';

export type ID = string;
export type BlobRef = ID;
export type Pt = { x: number; y: number };

export type BlobRole = 'source' | 'mask' | 'cutout' | 'thumb' | 'render' | 'fabric';
export interface StoredBlob {
  id: ID; ownerId: ID; role: BlobRole; mime: string; bytes: ArrayBuffer; w: number; h: number; size: number;
}

export interface BodyCalibration {
  shoulderL: Pt; shoulderR: Pt; waistL: Pt; waistR: Pt; hipL: Pt; hipR: Pt;
  ankleL: Pt; ankleR: Pt; wristL: Pt; wristR: Pt;
}

export interface Doll {
  id: ID; name: string; createdAt: number; isDefault: boolean;
  source: BlobRef; mask: BlobRef; cutout: BlobRef; thumb: BlobRef;
  w: number; h: number; // cutout pixel size
  calibration?: BodyCalibration;
}

export type Category = 'dress' | 'top' | 'pants' | 'skirt' | 'shoes' | 'accessory';
export const CATEGORIES: Category[] = ['dress', 'top', 'pants', 'skirt', 'shoes', 'accessory'];
export type Season = 'summer' | 'winter' | 'spring' | 'autumn';
export const SEASONS: Season[] = ['summer', 'winter', 'spring', 'autumn'];
export interface Tags { colors: string[]; occasions: string[]; seasons: Season[]; free: string[] }

/** Imported photo (raster) or a garment designed in the studio (parametric design). */
export type GarmentBody =
  | { kind: 'raster'; source: BlobRef; mask: BlobRef }
  | { kind: 'design'; design: GarmentDesign; bodyFrame: { x: number; y: number; w: number; h: number } };

/** Explicit saves of a studio design (capped, oldest pruned). */
export interface GarmentVersion { id: ID; garmentId: ID; createdAt: number; design: GarmentDesign; thumb: BlobRef }

export interface Garment {
  id: ID; name: string; category: Category; tags: Tags; tagIndex: string[];
  favorite: boolean; createdAt: number; updatedAt: number;
  render: BlobRef; thumb: BlobRef; w: number; h: number; // transparent PNG used by try-on
  body: GarmentBody;
  origin?: { type: 'file' | 'paste' | 'url' | 'studio'; url?: string };
}

export interface PlacedItem {
  id: ID; garmentId: ID;
  x: number; y: number; // centre, as a fraction of doll width / height
  scale: number; // garment height / doll height
  stretchX: number; rotation: number; flipX: boolean; z: number;
}

export interface Look {
  id: ID; name: string; dollId: ID | null; items: PlacedItem[]; favorite: boolean;
  render?: BlobRef; thumb?: BlobRef; createdAt: number; updatedAt: number;
  /** made by the realistic (AI) try-on: a picture only, it cannot be re-opened on the doll */
  ai?: boolean;
}
export const DRAFT_LOOK_ID = 'draft';

export interface MetaEntry { key: string; value: unknown }

export function buildTagIndex(t: Tags): string[] {
  return [
    ...t.colors.map((c) => `color:${c}`),
    ...t.occasions.map((o) => `occasion:${o}`),
    ...t.seasons.map((s) => `season:${s}`),
    ...t.free.map((f) => `free:${f}`),
  ];
}
