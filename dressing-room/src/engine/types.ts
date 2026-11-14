import type { BlobRef, BodyCalibration, ID, Pt } from '../db/types';

export type { Pt };
export interface Rect { x: number; y: number; w: number; h: number }

/** A body row: left / right silhouette x at height y. */
export interface Level { y: number; l: number; r: number }
export interface Body {
  neck: Level; shoulder: Level; underarm: Level; bust: Level; waist: Level; hip: Level;
  crotchY: number;
  knee: Level; ankle: Level; // outer extents of both legs
  innerKnee: { l: number; r: number }; innerAnkle: { l: number; r: number };
  floorY: number; cx: number;
  wristL: Pt; wristR: Pt;
}
export type { BodyCalibration };

export type GarmentType = 'dress' | 'skirt' | 'top' | 'pants';
export type Profile = 'fitted' | 'aline' | 'mermaid';
export type Neckline = 'v' | 'round' | 'strapless' | 'offShoulder' | 'halter';
export type Sleeves = 'none' | 'spaghetti' | 'short' | 'puff' | 'long';
export type TemplateId = 'aline' | 'bodycon' | 'mermaid' | 'maxi' | 'skirt' | 'top' | 'pants';

export type FabricKind = 'solid' | 'satin' | 'velvet' | 'linen' | 'lace' | 'denim' | 'floral' | 'plaid' | 'image';
export interface Fabric {
  kind: FabricKind;
  colors: string[]; // [base, accent, accent2]
  image?: BlobRef; // for kind 'image'
  scale: number; // pattern scale multiplier
  sheen: number; // 0..1
  sequins: number; // 0..1 all-over sparkle
}

export type DetailKind = 'ruffle' | 'bow' | 'belt' | 'buttons' | 'zipper' | 'sequins' | 'embroidery';
/** x / y are fractions of the garment's own box (0..1), so details survive silhouette changes. */
export interface Detail {
  id: ID; kind: DetailKind; color: string;
  x: number; y: number; size: number;
  n?: number; // buttons: count · embroidery: motif index
  len?: number; // buttons / zipper: length as a fraction of the front
  host?: 'hem' | 'neckline'; // ruffle
}

export interface GarmentDesign {
  engineVersion: 1;
  template: TemplateId;
  type: GarmentType;
  profile: Profile;
  hem: number; // 0..1 (short → long)
  neckline: Neckline; neckDepth: number; // 0..1
  sleeves: Sleeves;
  waistFit: number; // 0 loose … 1 fitted
  ease: number; // 0..0.3 overall width
  flare: number; // 0..1
  slit: { side: 'left' | 'right' | 'center'; height: number } | null;
  fabric: Fabric;
  details: Detail[];
  seed: number;
}

export type PieceId = 'body' | 'sleeveL' | 'sleeveR' | 'strapL' | 'strapR' | 'band' | 'waistband' | 'legs';
export interface Fold { a: Pt; b: Pt; width: number; depth: number }
/** Soft bump in the cloth (bust shaping); coordinates in garment units, radius too. */
export interface Bump { x: number; y: number; r: number; a: number }
/** Pleats fanning out of one point (the waist): the way a gathered skirt falls. */
export interface Drape { cx: number; y0: number; reach: number; amount: number; n: number; phase: number }
export interface Line { d: string; dash?: boolean }
export interface Piece {
  id: PieceId; d: string; z: number; folds: Fold[]; box: Rect;
  bumps?: Bump[]; drape?: Drape; lines?: Line[];
}
export interface GarmentGeometry {
  pieces: Piece[];
  curves: { waist: Pt[]; hem: Pt[]; neckline: Pt[]; front: Pt[] };
  bbox: Rect;
  /** body-relative size unit (hip half-width), for scaling details and strokes */
  unit: number;
}
