import Dexie, { type Table } from 'dexie';
import type { Doll, Garment, GarmentVersion, Look, MetaEntry, StoredBlob } from './types';

export const SCHEMA_VERSION = 1;

class DressingRoomDB extends Dexie {
  dolls!: Table<Doll, string>;
  garments!: Table<Garment, string>;
  garmentVersions!: Table<GarmentVersion, string>;
  looks!: Table<Look, string>;
  blobs!: Table<StoredBlob, string>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super('dressing-room');
    this.version(1).stores({
      dolls: 'id, createdAt',
      garments: 'id, category, *tagIndex, updatedAt',
      garmentVersions: 'id, garmentId, createdAt',
      fabrics: 'id, kind, createdAt',
      looks: 'id, dollId, updatedAt',
      blobs: 'id, ownerId',
      meta: 'key',
    });
  }
}

export const db = new DressingRoomDB();

export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string; inner?: { name?: string } } | null)?.name;
  const inner = (e as { inner?: { name?: string } } | null)?.inner?.name;
  return name === 'QuotaExceededError' || inner === 'QuotaExceededError';
}
