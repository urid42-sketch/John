import { getBlob, makeStoredBlob } from '../db/blobs';
import type { DesignRender } from '../db/repo';
import { db } from '../db/schema';
import { CANONICAL } from '../engine/body';
import { hasFabricImage, registerFabricImage } from '../engine/fabricTiles';
import { generate } from '../engine/generate';
import { renderGarment } from '../engine/render';
import type { Fabric, GarmentDesign } from '../engine/types';
import { canvasToBlob, decodeToCanvas, releaseCanvas, scaledCopy } from '../imaging/load';

const FABRIC_OWNER = 'fabric-images';

/** Make sure an uploaded fabric image is decoded and known to the tile renderer. */
export async function ensureFabricImage(f: Fabric): Promise<void> {
  if (f.kind !== 'image' || !f.image || hasFabricImage(f.image)) return;
  const blob = await getBlob(f.image);
  if (blob) registerFabricImage(f.image, await decodeToCanvas(blob, 512));
}

/** Store a user photo as a reusable fabric swatch; returns its blob id. */
export async function addFabricImage(file: Blob): Promise<string> {
  const c = await decodeToCanvas(file, 512);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
  const rec = await makeStoredBlob(FABRIC_OWNER, 'fabric', blob, c.width, c.height);
  await db.blobs.add(rec);
  registerFabricImage(rec.id, c);
  return rec.id;
}

/** Final render of a design on the reference body: what the wardrobe and try-on use. */
export async function renderDesignForSave(design: GarmentDesign): Promise<DesignRender> {
  await ensureFabricImage(design.fabric);
  const g = generate(design, CANONICAL);
  const canvas = renderGarment(g, design, 1.6);
  const thumbC = scaledCopy(canvas, 256);
  try {
    const [png, thumb] = await Promise.all([canvasToBlob(canvas, 'image/png'), canvasToBlob(thumbC, 'image/png')]);
    return { png, w: canvas.width, h: canvas.height, thumb, thumbW: thumbC.width, thumbH: thumbC.height, frame: g.bbox };
  } finally {
    releaseCanvas(canvas); releaseCanvas(thumbC);
  }
}
