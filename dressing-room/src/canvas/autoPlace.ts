import { getBlob } from '../db/blobs';
import { getDraft, newPlacedItem, updateDollCalibration } from '../db/repo';
import { db } from '../db/schema';
import type { BlobRef, BodyCalibration, Doll, Garment, PlacedItem } from '../db/types';
import { autoCalibrate, fitGarment, type AlphaMap } from '../engine/autoFit';
import { DEFAULT_CALIBRATION, deriveBody } from '../engine/body';
import { ctx2d, decodeToCanvas, releaseCanvas } from '../imaging/load';

/** Low-resolution alpha channel of a stored image (enough to read a silhouette). */
export async function alphaOfBlob(blob: Blob, maxSide = 320): Promise<AlphaMap> {
  const c = await decodeToCanvas(blob, maxSide);
  const d = ctx2d(c, true).getImageData(0, 0, c.width, c.height).data;
  const data = new Uint8Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = d[i * 4 + 3];
  const out = { w: c.width, h: c.height, data };
  releaseCanvas(c);
  return out;
}
async function alphaOf(ref: BlobRef): Promise<AlphaMap | null> {
  const blob = await getBlob(ref);
  return blob ? alphaOfBlob(blob) : null;
}

/** Body landmarks read from the cutout itself; null when it is not a clear standing figure. */
export async function detectCalibration(cutout: Blob): Promise<BodyCalibration | null> {
  try { return autoCalibrate(await alphaOfBlob(cutout)); } catch { return null; }
}

/** The doll's calibration; detected and saved on first use for dolls that have none. */
async function calibrationOf(doll: Doll): Promise<BodyCalibration> {
  if (doll.calibration) return doll.calibration;
  const a = await alphaOf(doll.cutout);
  const found = a ? autoCalibrate(a) : null;
  if (found) await updateDollCalibration(doll.id, found).catch(() => undefined);
  return found ?? DEFAULT_CALIBRATION;
}

/**
 * New item, already sitting on the body. Imported garments are fitted from their silhouette
 * (waist to waist, centred, widened where narrower than her); if that is not possible the
 * per-category default placement is used and she adjusts by hand.
 */
export async function autoPlace(g: Garment, doll: Doll | null, existing: PlacedItem[]): Promise<PlacedItem> {
  const item = newPlacedItem(g, existing, doll);
  if (!doll || g.body.kind !== 'raster') return item;
  try {
    const [cal, alpha] = await Promise.all([calibrationOf(doll), alphaOf(g.render)]);
    if (!alpha) return item;
    const p = fitGarment(alpha, g.w / g.h, g.category, deriveBody(cal, doll.w, doll.h), doll.w, doll.h);
    return p ? { ...item, ...p } : item;
  } catch (e) {
    console.error(e);
    return item;
  }
}

/** Re-run the automatic fit for an item that is already on the doll. */
export async function refit(item: PlacedItem, g: Garment, doll: Doll): Promise<PlacedItem> {
  const fresh = await autoPlace(g, doll, []);
  return { ...item, x: fresh.x, y: fresh.y, scale: fresh.scale, stretchX: fresh.stretchX, fit: fresh.fit, rotation: 0 };
}

/** "Try on" from the wardrobe: add to the saved session with the automatic fit. */
export async function addToDraftFitted(g: Garment): Promise<void> {
  const d = await getDraft();
  const dolls = await db.dolls.toArray();
  const doll = dolls.find((x) => x.id === d.dollId) ?? dolls.find((x) => x.isDefault) ?? dolls[0] ?? null;
  const item = await autoPlace(g, doll, d.items);
  await db.transaction('rw', db.looks, async () => {
    const cur = await getDraft();
    await db.looks.put({ ...cur, items: [...cur.items, { ...item, z: cur.items.reduce((m, i) => Math.max(m, i.z), 0) + 1 }], updatedAt: Date.now() });
  });
}
