import { describe, expect, it } from 'vitest';
import { crc32, readZip, ZipWriter } from './zip';

describe('zip container', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips entries, including bytes that look like zip signatures', async () => {
    const tricky = new Uint8Array(5000);
    for (let i = 0; i < tricky.length; i++) tricky[i] = (i * 31) & 255;
    tricky.set([0x50, 0x4b, 0x07, 0x08, 0x50, 0x4b, 0x03, 0x04, 0x50, 0x4b, 0x01, 0x02, 0x50, 0x4b, 0x05, 0x06], 1234);
    const w = new ZipWriter();
    w.add('manifest.json', new TextEncoder().encode('{"a":"שלום"}'));
    w.add('blobs/x', tricky);
    w.add('empty', new Uint8Array(0));
    const zip = await readZip(w.finish());
    expect([...zip.keys()]).toEqual(['manifest.json', 'blobs/x', 'empty']);
    expect(new TextDecoder().decode(await zip.get('manifest.json')!.read())).toBe('{"a":"שלום"}');
    expect(await zip.get('blobs/x')!.read()).toEqual(tricky);
    expect((await zip.get('empty')!.read()).length).toBe(0);
  });

  it('rejects a truncated file and a non-zip', async () => {
    const w = new ZipWriter();
    w.add('a', new Uint8Array(3000).fill(7));
    const whole = w.finish();
    await expect(readZip(whole.slice(0, whole.size - 40))).rejects.toThrow();
    await expect(readZip(new Blob([new Uint8Array(500).fill(1)]))).rejects.toThrow();
  });

  it('detects a damaged entry by its checksum', async () => {
    const w = new ZipWriter();
    w.add('a', new Uint8Array(100).fill(9));
    const bytes = new Uint8Array(await w.finish().arrayBuffer());
    bytes[60] ^= 0xff; // inside the entry data
    const zip = await readZip(new Blob([bytes]));
    await expect(zip.get('a')!.read()).rejects.toThrow();
  });
});
