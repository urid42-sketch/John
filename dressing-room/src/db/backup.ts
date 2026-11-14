import { db, SCHEMA_VERSION } from './schema';
import type { StoredBlob } from './types';
import { readZip, ZipWriter } from './zip';

const APP = 'dressing-room', FORMAT = 1;
const TABLES = ['dolls', 'garments', 'garmentVersions', 'looks', 'meta'] as const;
type BlobMeta = Omit<StoredBlob, 'bytes'>;
const text = new TextEncoder(), untext = new TextDecoder();

export class BackupError extends Error {
  constructor(public code: 'notBackup' | 'tooNew' | 'corrupt') { super(code); }
}
export interface BackupCounts { dolls: number; garments: number; looks: number; blobs: number }

/** Everything (dolls, wardrobe, designs, looks, images) in one ZIP. Images are stored, not re-compressed. */
export async function exportBackup(onProgress?: (ratio: number) => void): Promise<{ blob: Blob; name: string; counts: BackupCounts }> {
  const zip = new ZipWriter();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = (await db.table(t).toArray()).filter((r) => !(t === 'meta' && (r as { key: string }).key === 'lastBackupAt'));
  const ids = (await db.blobs.toCollection().primaryKeys()) as string[];
  const counts: BackupCounts = { dolls: data.dolls.length, garments: data.garments.length, looks: data.looks.length, blobs: ids.length };
  zip.add('manifest.json', text.encode(JSON.stringify({ app: APP, formatVersion: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), counts })));
  for (const t of TABLES) zip.add(`data/${t}.json`, text.encode(JSON.stringify(data[t])));
  // One image in memory at a time; the writer folds finished bytes into a Blob as it goes.
  const metas: BlobMeta[] = [];
  for (let i = 0; i < ids.length; i++) {
    const rec = await db.blobs.get(ids[i]);
    if (rec) {
      zip.add(`blobs/${rec.id}`, new Uint8Array(rec.bytes));
      metas.push({ id: rec.id, ownerId: rec.ownerId, role: rec.role, mime: rec.mime, w: rec.w, h: rec.h, size: rec.bytes.byteLength });
    }
    onProgress?.((i + 1) / ids.length);
  }
  zip.add('data/blobs.json', text.encode(JSON.stringify(metas)));
  counts.blobs = metas.length;
  const day = new Date().toISOString().slice(0, 10);
  return { blob: zip.finish(), name: `chadar-halbasha-${day}.zip`, counts };
}

/** Call once the file has really been handed to the user (share sheet / download). */
export async function markBackupDone(): Promise<void> {
  await db.meta.put({ key: 'lastBackupAt', value: Date.now() });
}

/**
 * Replace everything in the app with the contents of a backup file.
 * The whole file is validated BEFORE anything is deleted: complete zip, known format, every image
 * listed in the index present with the right size. A truncated or foreign file changes nothing.
 */
export async function importBackup(file: Blob, onProgress?: (ratio: number) => void): Promise<BackupCounts> {
  let zip: Awaited<ReturnType<typeof readZip>>;
  try { zip = await readZip(file); } catch { throw new BackupError('notBackup'); }
  const json = async <T,>(name: string): Promise<T> => {
    const e = zip.get(name);
    if (!e) throw new BackupError('corrupt');
    try { return JSON.parse(untext.decode(await e.read())) as T; } catch { throw new BackupError('corrupt'); }
  };
  if (!zip.has('manifest.json')) throw new BackupError('notBackup');
  const manifest = await json<{ app?: string; formatVersion?: number; schemaVersion?: number; counts?: BackupCounts }>('manifest.json');
  if (manifest.app !== APP || manifest.formatVersion !== FORMAT) throw new BackupError('notBackup');
  if ((manifest.schemaVersion ?? 0) > SCHEMA_VERSION) throw new BackupError('tooNew');

  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = await json<unknown[]>(`data/${t}.json`);
    if (!Array.isArray(rows)) throw new BackupError('corrupt');
    tables[t] = rows;
  }
  const metas = await json<BlobMeta[]>('data/blobs.json');
  if (!Array.isArray(metas)) throw new BackupError('corrupt');
  for (const m of metas) if (zip.get(`blobs/${m.id}`)?.size !== m.size) throw new BackupError('corrupt');
  const c = manifest.counts;
  if (c && (c.dolls !== tables.dolls.length || c.garments !== tables.garments.length || c.looks !== tables.looks.length || c.blobs !== metas.length)) {
    throw new BackupError('corrupt');
  }

  // Point of no return.
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear(); });
  let batch: StoredBlob[] = [], batchBytes = 0;
  const flush = async () => { if (batch.length) { await db.blobs.bulkPut(batch); batch = []; batchBytes = 0; } };
  for (let i = 0; i < metas.length; i++) {
    const bytes = await zip.get(`blobs/${metas[i].id}`)!.read();
    batch.push({ ...metas[i], bytes: bytes.buffer as ArrayBuffer });
    batchBytes += bytes.length;
    if (batch.length >= 20 || batchBytes > 16 * 1024 * 1024) await flush();
    onProgress?.((i + 1) / metas.length);
  }
  await flush();
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) if (tables[t].length) await db.table(t).bulkPut(tables[t]);
  });
  return { dolls: tables.dolls.length, garments: tables.garments.length, looks: tables.looks.length, blobs: metas.length };
}

export async function lastBackupAt(): Promise<number | null> {
  const m = await db.meta.get('lastBackupAt');
  return typeof m?.value === 'number' ? m.value : null;
}
