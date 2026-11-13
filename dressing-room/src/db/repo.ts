import { db } from './schema';
import { makeStoredBlob } from './blobs';
import {
  buildTagIndex, DRAFT_LOOK_ID,
  type Category, type Doll, type Garment, type ID, type Look, type PlacedItem, type Tags,
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
  await db.transaction('rw', db.garments, db.blobs, async () => {
    await db.garments.delete(id);
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

export function newPlacedItem(g: Pick<Garment, 'id' | 'category'>, existing: PlacedItem[]): PlacedItem {
  const p = PLACEMENT[g.category];
  const z = existing.reduce((m, i) => Math.max(m, i.z), 0) + 1;
  return {
    id: crypto.randomUUID(), garmentId: g.id, x: 0.5, y: p.y, scale: p.scale,
    stretchX: 1, rotation: 0, flipX: false, z,
  };
}

export async function addToDraft(g: Garment): Promise<void> {
  await db.transaction('rw', db.looks, async () => {
    const d = await getDraft();
    await db.looks.put({ ...d, items: [...d.items, newPlacedItem(g, d.items)], updatedAt: Date.now() });
  });
}
