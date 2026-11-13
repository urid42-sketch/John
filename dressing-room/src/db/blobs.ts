import { useEffect, useState } from 'react';
import { db } from './schema';
import type { BlobRef, BlobRole, ID, StoredBlob } from './types';

export async function makeStoredBlob(
  ownerId: ID, role: BlobRole, blob: Blob, w: number, h: number,
): Promise<StoredBlob> {
  const bytes = await blob.arrayBuffer();
  return { id: crypto.randomUUID(), ownerId, role, mime: blob.type || 'image/png', bytes, w, h, size: bytes.byteLength };
}

export async function getBlob(id: BlobRef): Promise<Blob | null> {
  const rec = await db.blobs.get(id);
  return rec ? new Blob([rec.bytes], { type: rec.mime }) : null;
}

export async function deleteBlobsOf(ownerId: ID): Promise<void> {
  await db.blobs.where('ownerId').equals(ownerId).delete();
}

// Shared object-URL cache with reference counting, so grids don't leak URLs.
const cache = new Map<BlobRef, { url: string; refs: number; timer?: ReturnType<typeof setTimeout> }>();
const pending = new Map<BlobRef, Promise<string | null>>();

async function acquire(id: BlobRef): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) {
    if (hit.timer) { clearTimeout(hit.timer); hit.timer = undefined; }
    hit.refs++;
    return hit.url;
  }
  let p = pending.get(id);
  if (!p) {
    p = getBlob(id).finally(() => pending.delete(id)).then((b) => {
      if (!b) return null;
      const url = URL.createObjectURL(b);
      cache.set(id, { url, refs: 0 });
      return url;
    });
    pending.set(id, p);
  }
  const url = await p;
  const entry = cache.get(id);
  if (url && entry) entry.refs++;
  return url;
}

function release(id: BlobRef) {
  const entry = cache.get(id);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    // Short grace period: avoids re-reading the blob when a list re-renders.
    entry.timer = setTimeout(() => {
      URL.revokeObjectURL(entry.url);
      cache.delete(id);
    }, 3000);
  }
}

export function useBlobUrl(id: BlobRef | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? cache.get(id)?.url ?? null : null));
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    setUrl(cache.get(id)?.url ?? null); // never show the previous id's (soon revoked) URL
    let alive = true;
    let got = false;
    acquire(id).then((u) => {
      if (!u) return;
      if (alive) { got = true; setUrl(u); } else release(id);
    }).catch(() => { /* missing blob: render nothing */ });
    return () => { alive = false; if (got) release(id); };
  }, [id]);
  return url;
}
