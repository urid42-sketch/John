// Minimal ZIP container, "stored" entries only (images are already compressed).
// Written by hand so that reading never has to guess where an entry ends: the reader uses the
// central directory and exact byte ranges of the file, and never loads the whole file into memory.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder(), dec = new TextDecoder();
const FOLD = 8 * 1024 * 1024;

export class ZipWriter {
  private done: Blob = new Blob([]);
  private pending: Uint8Array[] = [];
  private pendingSize = 0;
  private offset = 0;
  private entries: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  private push(bytes: Uint8Array) {
    this.pending.push(bytes);
    this.pendingSize += bytes.length;
    this.offset += bytes.length;
    // Fold finished bytes into a Blob so the browser can move them out of the JS heap.
    if (this.pendingSize >= FOLD) {
      this.done = new Blob([this.done, ...(this.pending as BlobPart[])]);
      this.pending = []; this.pendingSize = 0;
    }
  }

  add(path: string, data: Uint8Array) {
    if (this.entries.length >= 65535 || this.offset + data.length > 0xfffffff0) throw new Error('backup too large');
    const name = enc.encode(path), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); // UTF-8 names
    h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    this.entries.push({ name, crc, size: data.length, offset: this.offset });
    this.push(new Uint8Array(h.buffer)); this.push(name); this.push(data);
  }

  finish(): Blob {
    const start = this.offset;
    for (const e of this.entries) {
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, e.crc, true); c.setUint32(20, e.size, true); c.setUint32(24, e.size, true);
      c.setUint16(28, e.name.length, true); c.setUint32(42, e.offset, true);
      this.push(new Uint8Array(c.buffer)); this.push(e.name);
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.entries.length, true); end.setUint16(10, this.entries.length, true);
    end.setUint32(12, this.offset - start, true); end.setUint32(16, start, true);
    this.push(new Uint8Array(end.buffer));
    return new Blob([this.done, ...(this.pending as BlobPart[])], { type: 'application/zip' });
  }
}

export interface ZipEntry { name: string; size: number; crc: number; read(): Promise<Uint8Array> }

/** Index of a ZIP file. Throws when the file is not a complete zip of stored entries. */
export async function readZip(file: Blob): Promise<Map<string, ZipEntry>> {
  const tailStart = Math.max(0, file.size - 65557);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no end record'); // truncated download, or not a zip at all
  const count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset + cdSize > file.size) throw new Error('bad directory');
  const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const out = new Map<string, ZipEntry>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== 0x02014b50) throw new Error('bad directory');
    const method = cd.getUint16(p + 10, true), crc = cd.getUint32(p + 16, true), size = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true), extra = cd.getUint16(p + 30, true), comment = cd.getUint16(p + 32, true);
    const offset = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nameLen));
    if (method !== 0 || size !== cd.getUint32(p + 24, true)) throw new Error('compressed entry');
    if (offset + 30 + size > file.size) throw new Error('entry out of range');
    out.set(name, {
      name, size, crc,
      read: async () => {
        const lh = new DataView(await file.slice(offset, offset + 30).arrayBuffer());
        if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('bad entry');
        const start = offset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const bytes = new Uint8Array(await file.slice(start, start + size).arrayBuffer());
        if (bytes.length !== size || crc32(bytes) !== crc) throw new Error('damaged entry');
        return bytes;
      },
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
