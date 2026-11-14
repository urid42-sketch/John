import { Unzip, UnzipInflate, Zip, ZipPassThrough, strFromU8, strToU8 } from 'fflate';
import { db, SCHEMA_VERSION } from './schema';
import type { StoredBlob } from './types';

const APP = 'dressing-room', FORMAT = 1;
const TABLES = ['dolls', 'garments', 'garmentVersions', 'looks', 'meta'] as const;
type BlobMeta = Omit<StoredBlob, 'bytes'>;

export class BackupError extends Error {
  constructor(public code: 'notBackup' | 'tooNew' | 'corrupt') { super(code); }
}
export interface BackupCounts { dolls: number; garments: number; looks: number; blobs: number }

/** Everything (dolls, wardrobe, designs, looks, images) in one ZIP. Images are stored, not re-compressed. */
export async function exportBackup(onProgress?: (ratio: number) => void): Promise<{ blob: Blob; name: string; counts: BackupCounts }> {
  const parts: Uint8Array[] = [];
  let failed: Error | null = null;
  let finish!: () => void, fail!: (e: Error) => void;
  const done = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  const zip = new Zip((err, chunk, final) => {
    if (err) { failed = err; fail(err); return; }
    parts.push(chunk);
    if (final) finish();
  });
  const add = (name: string, data: Uint8Array) => {
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(data, true);
  };

  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  const ids = (await db.blobs.toCollection().primaryKeys()) as string[];
  const counts: BackupCounts = { dolls: data.dolls.length, garments: data.garments.length, looks: data.looks.length, blobs: ids.length };
  add('manifest.json', strToU8(JSON.stringify({ app: APP, formatVersion: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), counts })));
  for (const t of TABLES) add(`data/${t}.json`, strToU8(JSON.stringify(data[t])));

  // Blob metadata first (the reader needs it before the bytes), then the bytes one by one.
  const metas: BlobMeta[] = [];
  await db.blobs.each((b) => { metas.push({ id: b.id, ownerId: b.ownerId, role: b.role, mime: b.mime, w: b.w, h: b.h, size: b.size }); });
  add('data/blobs.json', strToU8(JSON.stringify(metas)));
  for (let i = 0; i < ids.length; i++) {
    if (failed) throw failed;
    const rec = await db.blobs.get(ids[i]);
    if (rec) add(`blobs/${rec.id}`, new Uint8Array(rec.bytes));
    onProgress?.((i + 1) / ids.length);
  }
  zip.end();
  await done;
  await db.meta.put({ key: 'lastBackupAt', value: Date.now() });
  const day = new Date().toISOString().slice(0, 10);
  return { blob: new Blob(parts as BlobPart[], { type: 'application/zip' }), name: `chadar-halbasha-${day}.zip`, counts };
}

/** Replace everything in the app with the contents of a backup file. */
export async function importBackup(file: Blob, onProgress?: (ratio: number) => void): Promise<BackupCounts> {
  const tables: Record<string, unknown[]> = {};
  const metas = new Map<string, BlobMeta>();
  const queue: StoredBlob[] = [];
  let manifest: { app?: string; formatVersion?: number; schemaVersion?: number; counts?: BackupCounts } | null = null;
  let error: Error | null = null;
  let cleared = false;
  let blobCount = 0;

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (f) => {
    const chunks: Uint8Array[] = [];
    f.ondata = (err, chunk, final) => {
      if (err) { error = new BackupError('corrupt'); return; }
      chunks.push(chunk.slice()); // the chunk may be a view into the read buffer
      if (!final) return;
      let size = 0;
      for (const c of chunks) size += c.length;
      const all = new Uint8Array(size);
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      try {
        if (f.name === 'manifest.json') manifest = JSON.parse(strFromU8(all));
        else if (!manifest) error = new BackupError('notBackup');
        else if (f.name === 'data/blobs.json') for (const m of JSON.parse(strFromU8(all)) as BlobMeta[]) metas.set(m.id, m);
        else if (f.name.startsWith('data/')) tables[f.name.slice(5, -5)] = JSON.parse(strFromU8(all));
        else if (f.name.startsWith('blobs/')) {
          const meta = metas.get(f.name.slice(6));
          if (meta) queue.push({ ...meta, bytes: all.buffer as ArrayBuffer });
        }
      } catch { error = new BackupError('corrupt'); }
    };
    f.start();
  };

  const flush = async () => {
    if (!manifest) return;
    if (manifest.app !== APP || manifest.formatVersion !== FORMAT) throw new BackupError('notBackup');
    if ((manifest.schemaVersion ?? 0) > SCHEMA_VERSION) throw new BackupError('tooNew');
    if (!cleared) {
      cleared = true;
      await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear(); });
    }
    while (queue.length) {
      const batch = queue.splice(0, 20);
      await db.blobs.bulkPut(batch);
      blobCount += batch.length;
    }
  };

  const reader = file.stream().getReader();
  let read = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) { unzip.push(value, false); read += value.length; onProgress?.(read / file.size); }
      if (error) throw error;
      await flush();
      if (done) break;
    }
    unzip.push(new Uint8Array(0), true);
    if (error) throw error;
    if (!manifest) throw new BackupError('notBackup');
    await flush();
    await db.transaction('rw', db.tables, async () => {
      for (const t of TABLES) if (tables[t]?.length) await db.table(t).bulkPut(tables[t]);
    });
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw cleared ? e : new BackupError('notBackup');
  }
  return {
    dolls: tables.dolls?.length ?? 0, garments: tables.garments?.length ?? 0, looks: tables.looks?.length ?? 0, blobs: blobCount,
  };
}

export async function lastBackupAt(): Promise<number | null> {
  const m = await db.meta.get('lastBackupAt');
  return typeof m?.value === 'number' ? m.value : null;
}
