import { CANONICAL, CANONICAL_CALIBRATION, CANONICAL_SIZE } from '../engine/body';
import { presetFabric } from '../engine/fabricPresets';
import { renderMannequin } from '../engine/mannequin';
import { fromTemplate } from '../engine/templates';
import type { TemplateId } from '../engine/types';
import { he } from '../i18n/he';
import { canvasToBlob, releaseCanvas, scaledCopy } from '../imaging/load';
import { renderDesignForSave } from '../studio/renderDesign';
import { addDoll, saveDesign } from './repo';
import { db } from './schema';
import type { Doll } from './types';

/** A shop mannequin as a ready doll, so the app is usable before any photo is uploaded. */
export async function addMannequinDoll(): Promise<Doll> {
  const c = renderMannequin(CANONICAL, CANONICAL_SIZE.w, CANONICAL_SIZE.h, 1.6);
  const thumb = scaledCopy(c, 256);
  try {
    const [png, th] = await Promise.all([canvasToBlob(c, 'image/png'), canvasToBlob(thumb, 'image/png')]);
    // untrimmed on purpose: the canonical landmarks then apply as they are
    return await addDoll(he.starter.dollName, {
      source: png, sourceW: c.width, sourceH: c.height, mask: png, cutout: png, w: c.width, h: c.height,
      thumb: th, thumbW: thumb.width, thumbH: thumb.height,
    }, CANONICAL_CALIBRATION);
  } finally { releaseCanvas(c); releaseCanvas(thumb); }
}

const SAMPLES: [TemplateId, string, keyof typeof he.starter.samples][] = [
  ['aline', 'printPeony', 'dress'], ['mermaid', 'satinEmerald', 'gown'], ['top', 'linenWhite', 'top'],
  ['skirt', 'plaidRed', 'skirt'], ['pants', 'denimDark', 'pants'],
];

/** A few ready garments (made by the studio engine) so there is something to try on at once. */
export async function addStarterWardrobe(): Promise<void> {
  if ((await db.garments.count()) > 0) return;
  for (const [template, cloth, name] of SAMPLES) {
    const d = { ...fromTemplate(template), fabric: presetFabric(cloth), seed: 5 };
    await saveDesign(he.starter.samples[name], d, await renderDesignForSave(d));
  }
}
