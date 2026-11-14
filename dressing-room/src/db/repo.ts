import { db } from './schema';
import { makeStoredBlob } from './blobs';
import { CANONICAL, DEFAULT_CALIBRATION, deriveBody } from '../engine/body';
import type { GarmentDesign } from '../engine/types';
import {
  buildTagIndex, DRAFT_LOOK_ID,
  type Category, type Doll, type Garment, type GarmentVersion, type ID, type Look, type PlacedItem, type Tags,
} from './types';

export interface CutoutResult {
  source: Blob; sourceW: number; sourceH: number;
  mask: Blob;
  cutout: Blob; w: number; h: number;
  thumb: Blob; thumbW: number; thumbH: number;
}

async function cutoutBlobs(ownerId: ID, c: CutoutResult, displayRole: 'cutout' | 'render') {
  const [source, mask, display, thumb] = await Promise.all([
    makeStoredBlob(ownerId, 'source', c.source, c.sourceW, c.sourceH),
    makeStoredBlob(ownerId, 'mask', c.mask, c.sourceW, c.sourceH),
    makeStoredBlob(ownerId, displayRole, c.cutout, c.w, c.h),
    makeStoredBlob(ownerId, 'thumb', c.thumb, c.thumbW, c.thumbH),
  ]);
  return { source, mask, display, thumb };
}

export async function addDoll(name: string, c: CutoutResult): Promise<Doll> {
  const id = crypto.randomUUID();
  const b = await cutoutBlobs(id, c, 'cutout');
  const first = (await db.dolls.count()) === 0;
  const doll: Doll = {
    id, name, createdAt: Date.now(), isDefault: first,
    source: b.source.id, mask: b.mask.id, cutout: b.display.id, thumb: b.thumb.id, w: c.w, h: c.h,
  };
  await db.transaction('rw', db.dolls, db.blobs, async () => {
    await db.blobs.bulkAdd([b.source, b.mask, b.display, b.thumb]);
    await db.dolls.add(doll);
  });
  return doll;
}

export async function setDefaultDoll(id: ID): Promise<void> {
  await db.transaction('rw', db.dolls, async () => {
    await db.dolls.toCollection().modify((d) => { d.isDefault = d.id === id; });
  });
}

export async function deleteDoll(id: ID): Promise<void> {
  await db.transaction('rw', db.dolls, db.blobs, async () => {
    const doll = await db.dolls.get(id);
    await db.dolls.delete(id);
    await db.blobs.where('ownerId').equals(id).delete();
    if (doll?.isDefault) {
      const next = await db.dolls.orderBy('createdAt').first();
      if (next) await db.dolls.update(next.id, { isDefault: true });
    }
  });
}

export interface GarmentMeta { name: string; category: Category; tags: Tags }

export async function addGarment(
  meta: GarmentMeta, c: CutoutResult, origin: Garment['origin'],
): Promise<Garment> {
  const id = crypto.randomUUID();
  const b = await cutoutBlobs(id, c, 'render');
  const now = Date.now();
  const g: Garment = {
    id, ...meta, tagIndex: buildTagIndex(meta.tags), favorite: false, createdAt: now, updatedAt: now,
    render: b.display.id, thumb: b.thumb.id, w: c.w, h: c.h,
    body: { kind: 'raster', source: b.source.id, mask: b.mask.id }, origin,
  };
  await db.transaction('rw', db.garments, db.blobs, async () => {
    await db.blobs.bulkAdd([b.source, b.mask, b.display, b.thumb]);
    await db.garments.add(g);
  });
  return g;
}

export async function updateGarmentMeta(id: ID, meta: GarmentMeta): Promise<void> {
  await db.garments.update(id, { ...meta, tagIndex: buildTagIndex(meta.tags), updatedAt: Date.now() });
}

export async function deleteGarment(id: ID): Promise<void> {
  await db.transaction('rw', db.garments, db.garmentVersions, db.blobs, async () => {
    await db.garments.delete(id);
    await db.garmentVersions.where('garmentId').equals(id).delete();
    await db.blobs.where('ownerId').equals(id).delete();
  });
}

export async function getDraft(): Promise<Look> {
  const d = await db.looks.get(DRAFT_LOOK_ID);
  if (d) return d;
  const now = Date.now();
  return { id: DRAFT_LOOK_ID, name: '', dollId: null, items: [], favorite: false, createdAt: now, updatedAt: now };
}

export async function saveDraft(dollId: ID | null, items: PlacedItem[]): Promise<void> {
  await db.transaction('rw', db.looks, async () => {
    const prev = await getDraft();
    await db.looks.put({ ...prev, dollId, items, updatedAt: Date.now() });
  });
}

/** Default placement per category, relative to the doll (centre y, height fraction). */
const PLACEMENT: Record<Category, { y: number; scale: number }> = {
  dress: { y: 0.47, scale: 0.5 },
  top: { y: 0.32, scale: 0.26 },
  pants: { y: 0.68, scale: 0.48 },
  skirt: { y: 0.56, scale: 0.26 },
  shoes: { y: 0.95, scale: 0.09 },
  accessory: { y: 0.2, scale: 0.12 },
};

/**
 * Where a new item lands on the doll. Studio designs know their place on the reference body,
 * so they are mapped onto this doll's own proportions; imported photos use a per-category guess.
 */
export function newPlacedItem(g: Garment, existing: PlacedItem[], doll: Doll | null): PlacedItem {
  const z = existing.reduce((m, i) => Math.max(m, i.z), 0) + 1;
  const item: PlacedItem = {
    id: crypto.randomUUID(), garmentId: g.id, x: 0.5, y: PLACEMENT[g.category].y, scale: PLACEMENT[g.category].scale,
    stretchX: 1, rotation: 0, flipX: false, z,
  };
  if (g.body.kind !== 'design' || !doll) return item;
  const f = g.body.bodyFrame, C = CANONICAL;
  const b = deriveBody(doll.calibration ?? DEFAULT_CALIBRATION, doll.w, doll.h);
  const ky = (b.ankle.y - b.shoulder.y) / (C.ankle.y - C.shoulder.y);
  const kx = ((b.shoulder.r - b.shoulder.l) / (C.shoulder.r - C.shoulder.l) + (b.hip.r - b.hip.l) / (C.hip.r - C.hip.l)) / 2;
  const cx = b.cx + (f.x + f.w / 2 - C.cx) * kx;
  const cy = b.shoulder.y + (f.y + f.h / 2 - C.shoulder.y) * ky;
  return { ...item, x: cx / doll.w, y: cy / doll.h, scale: (f.h * ky) / doll.h, stretchX: Math.min(1.8, Math.max(0.5, kx / ky)) };
}

export async function addToDraft(g: Garment): Promise<void> {
  await db.transaction('rw', db.looks, db.dolls, async () => {
    const d = await getDraft();
    const dolls = await db.dolls.toArray();
    const doll = dolls.find((x) => x.id === d.dollId) ?? dolls.find((x) => x.isDefault) ?? dolls[0] ?? null;
    await db.looks.put({ ...d, items: [...d.items, newPlacedItem(g, d.items, doll)], updatedAt: Date.now() });
  });
}

// ---- studio designs ----
const MAX_VERSIONS = 20;
const DESIGN_CATEGORY: Record<GarmentDesign['type'], Category> = { dress: 'dress', top: 'top', skirt: 'skirt', pants: 'pants' };

export interface DesignRender {
  png: Blob; w: number; h: number; thumb: Blob; thumbW: number; thumbH: number;
  frame: { x: number; y: number; w: number; h: number };
}

/** Create a designed garment, or update one in place (pass its id). Every save adds a version. */
export async function saveDesign(name: string, design: GarmentDesign, r: DesignRender, id?: ID): Promise<Garment> {
  const gid = id ?? crypto.randomUUID();
  const [render, thumb, vThumb] = await Promise.all([
    makeStoredBlob(gid, 'render', r.png, r.w, r.h),
    makeStoredBlob(gid, 'thumb', r.thumb, r.thumbW, r.thumbH),
    makeStoredBlob(gid, 'thumb', r.thumb, r.thumbW, r.thumbH),
  ]);
  const now = Date.now();
  let out!: Garment;
  await db.transaction('rw', db.garments, db.garmentVersions, db.blobs, async () => {
    const prev = id ? await db.garments.get(id) : undefined;
    await db.blobs.bulkAdd([render, thumb, vThumb]);
    if (prev) await db.blobs.bulkDelete([prev.render, prev.thumb]);
    const tags = prev?.tags ?? { colors: [], occasions: [], seasons: [], free: [] };
    out = {
      id: gid, name, category: DESIGN_CATEGORY[design.type], tags, tagIndex: buildTagIndex(tags),
      favorite: prev?.favorite ?? false, createdAt: prev?.createdAt ?? now, updatedAt: now,
      render: render.id, thumb: thumb.id, w: r.w, h: r.h,
      body: { kind: 'design', design, bodyFrame: r.frame }, origin: { type: 'studio' },
    };
    await db.garments.put(out);
    const version: GarmentVersion = { id: crypto.randomUUID(), garmentId: gid, createdAt: now, design, thumb: vThumb.id };
    await db.garmentVersions.add(version);
    const all = await db.garmentVersions.where('garmentId').equals(gid).sortBy('createdAt');
    for (const old of all.slice(0, Math.max(0, all.length - MAX_VERSIONS))) {
      await db.garmentVersions.delete(old.id);
      await db.blobs.delete(old.thumb);
    }
  });
  return out;
}

export async function updateDollCalibration(id: ID, calibration: Doll['calibration']): Promise<void> {
  await db.dolls.update(id, { calibration });
}

// ---- edits of imported (raster) garments ----
export interface EditedRender { png: Blob; w: number; h: number; thumb: Blob; thumbW: number; thumbH: number }

/** Replace the displayed image of an imported garment, or save the edit as a new garment. */
export async function saveRasterEdit(g: Garment, r: EditedRender, asCopy: boolean): Promise<Garment> {
  if (g.body.kind !== 'raster') throw new Error('not a raster garment');
  const id = asCopy ? crypto.randomUUID() : g.id;
  const [render, thumb] = await Promise.all([
    makeStoredBlob(id, 'render', r.png, r.w, r.h),
    makeStoredBlob(id, 'thumb', r.thumb, r.thumbW, r.thumbH),
  ]);
  const now = Date.now();
  let out!: Garment;
  await db.transaction('rw', db.garments, db.blobs, async () => {
    let body = g.body;
    if (asCopy && g.body.kind === 'raster') {
      // the copy owns its own original, so deleting one garment never breaks the other
      const [src, mask] = await Promise.all([db.blobs.get(g.body.source), db.blobs.get(g.body.mask)]);
      if (src && mask) {
        const s2 = { ...src, id: crypto.randomUUID(), ownerId: id }, m2 = { ...mask, id: crypto.randomUUID(), ownerId: id };
        await db.blobs.bulkAdd([s2, m2]);
        body = { kind: 'raster', source: s2.id, mask: m2.id };
      }
    }
    await db.blobs.bulkAdd([render, thumb]);
    if (!asCopy) await db.blobs.bulkDelete([g.render, g.thumb]);
    out = {
      ...g, id, body, name: asCopy ? `${g.name} (עותק)` : g.name, render: render.id, thumb: thumb.id, w: r.w, h: r.h,
      createdAt: asCopy ? now : g.createdAt, updatedAt: now,
    };
    await db.garments.put(out);
  });
  return out;
}
