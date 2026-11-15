import { rng } from './geometry';
import type { Fabric } from './types';

// Procedural fabric tiles: only the colour / weave / print of a cloth. Light, shadow, sheen and
// folds come from the lighting model (shade.ts), so these stay flat and seamless.

const SIZE = 256;
const cache = new Map<string, HTMLCanvasElement>();
const dataCache = new Map<string, { data: Uint8ClampedArray; w: number; h: number }>();
/** User-uploaded fabric images, registered by the studio once decoded. */
const images = new Map<string, HTMLCanvasElement>();

export function registerFabricImage(blobId: string, canvas: HTMLCanvasElement) {
  images.set(blobId, canvas);
  for (const k of [...cache.keys()]) if (k.includes(blobId)) { cache.delete(k); dataCache.delete(k); mips.delete(k); }
}
export const hasFabricImage = (blobId: string) => images.has(blobId);

// Photographed cloth detail (grey, mean 128) laid over the procedural colour with an "overlay"
// blend: it adds real fibres and weave without changing the colour the user picked.
const details = new Map<string, HTMLCanvasElement>();
const DETAIL_OF: Partial<Record<Fabric['kind'], [name: string, strength: number, repeat: number]>> = {
  satin: ['satin', 0.55, 1], velvet: ['velvet', 0.9, 1], denim: ['denim', 0.95, 2], linen: ['linen', 0.9, 2],
  solid: ['linen', 0.4, 3], floral: ['satin', 0.35, 1], plaid: ['linen', 0.5, 2],
};
export const BUILTIN_PRINTS = ['peony', 'ditsy', 'botanical'] as const;
export const fabricDetail = (kind: Fabric['kind']) => { const d = DETAIL_OF[kind]; return d ? details.get(d[0]) : undefined; };
export const assetCanvas = (name: string) => details.get(name);

function loadCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error(`texture ${url}`));
    img.src = url;
  });
}

let assets: Promise<void> | null = null;
/** Load the photographed textures once. Fabrics still work (plain procedural) if this fails. */
export function loadFabricAssets(): Promise<void> {
  assets ??= (async () => {
    const got = await Promise.allSettled([
      ...['velvet', 'satin', 'denim', 'linen', 'wood'].map(async (n) => { details.set(n, await loadCanvas(`/tex/${n}.jpg`)); }),
      ...BUILTIN_PRINTS.map(async (n) => { images.set(`builtin:${n}`, await loadCanvas(`/tex/print-${n}.jpg`)); }),
    ]);
    if (got.some((r) => r.status === 'rejected')) assets = null; // allow a retry later (offline first run)
    for (const c of cache.values()) c.width = 0;
    cache.clear(); dataCache.clear(); mips.clear();
  })();
  return assets;
}

export function shade(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Call fn at (x,y) and at its wrapped copies, so shapes crossing the tile edge stay seamless. */
function wrapped(size: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const px = x + dx, py = y + dy;
    if (px > -r && px < size + r && py > -r && py < size + r) fn(px, py);
  }
}

function grain(ctx: CanvasRenderingContext2D, rand: () => number, n: number, a: number, w = 1.5, h = 1.5) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(rand() * SIZE, rand() * SIZE, w, h);
  }
}

/** Fine woven structure: alternating over/under threads. */
function weave(ctx: CanvasRenderingContext2D, pitch: number, a: number) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  for (let y = 0; y < SIZE; y += pitch) for (let x = 0; x < SIZE; x += pitch) {
    if (((x / pitch) + (y / pitch)) % 2 === 0) ctx.fillRect(x, y, pitch / 2, pitch / 2);
  }
  ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
  for (let y = 0; y < SIZE; y += pitch) for (let x = 0; x < SIZE; x += pitch) {
    if (((x / pitch) + (y / pitch)) % 2 === 1) ctx.fillRect(x, y, pitch / 2, pitch / 2);
  }
}

function draw(f: Fabric, c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!;
  const [base, a1 = '#ffffff', a2 = '#3b302c'] = f.colors;
  const rand = rng(11);
  const fill = (color: string) => { ctx.fillStyle = color; ctx.fillRect(0, 0, SIZE, SIZE); };

  switch (f.kind) {
    case 'image': {
      const img = f.image ? images.get(f.image) : undefined;
      if (!img) { fill(base); break; }
      const S = c.width, h = S / 2;
      if (f.image?.startsWith('builtin:')) { ctx.drawImage(img, 0, 0, S, S); break; } // made to repeat: no mirroring
      // a user photo is mirrored 2×2 so it tiles without a visible seam
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        ctx.save();
        ctx.translate(sx ? S : 0, sy ? S : 0);
        ctx.scale(sx ? -1 : 1, sy ? -1 : 1);
        ctx.drawImage(img, 0, 0, h, h);
        ctx.restore();
      }
      break;
    }
    case 'satin':
      fill(base);
      weave(ctx, 2, 0.025); // satin is nearly smooth: its character comes from the highlights
      grain(ctx, rand, 900, 0.025);
      break;
    case 'velvet':
      fill(base);
      grain(ctx, rand, 5200, 0.07, 1, 1);
      grain(ctx, rand, 700, 0.05, 3, 3);
      break;
    case 'linen': {
      fill(base);
      for (let i = 0; i < 170; i++) { // slubs: uneven threads in both directions
        const horizontal = i % 2 === 0, len = 18 + rand() * 70, p = rand() * SIZE, s = rand() * SIZE;
        ctx.fillStyle = rand() > 0.45 ? `rgba(255,255,255,${0.05 + rand() * 0.08})` : `rgba(0,0,0,${0.04 + rand() * 0.07})`;
        wrapped(SIZE, horizontal ? s : p, horizontal ? p : s, len, (x, y) => (horizontal ? ctx.fillRect(x, y, len, 1 + rand() * 1.4) : ctx.fillRect(x, y, 1 + rand() * 1.4, len)));
      }
      weave(ctx, 4, 0.05);
      break;
    }
    case 'denim': {
      fill(base);
      if (!details.has('denim')) { // drawn twill only until the photographed weave is loaded
        ctx.lineWidth = 1.6;
        for (let i = -SIZE; i < SIZE * 2; i += 3) {
          ctx.strokeStyle = (i / 3) % 3 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,40,0.17)';
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - SIZE, SIZE); ctx.stroke();
        }
      }
      grain(ctx, rand, 500, 0.04);
      break;
    }
    case 'lace': {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = base; ctx.fillStyle = base; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5; ctx.lineWidth = 0.9; // fine diamond net
      for (let i = -SIZE; i <= SIZE * 2; i += 8) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + SIZE, SIZE); ctx.moveTo(i, 0); ctx.lineTo(i - SIZE, SIZE); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const petal = (x: number, y: number, r: number, a: number) => {
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.26, a, 0, Math.PI * 2); ctx.fill();
      };
      const flower = (x: number, y: number, r: number, petals: number) => {
        for (let k = 0; k < petals; k++) petal(x, y, r, (k / petals) * Math.PI * 2);
        ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, Math.PI * 2); ctx.stroke();
        ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      };
      for (const [x, y, r, n] of [[64, 64, 30, 7], [192, 64, 30, 7], [0, 192, 30, 7], [128, 192, 30, 7], [256, 192, 30, 7], [128, 64, 14, 5], [0, 64, 14, 5], [256, 64, 14, 5], [64, 192, 14, 5], [192, 192, 14, 5]]) {
        wrapped(SIZE, x, y, 40, (px, py) => flower(px, py, r, n));
      }
      ctx.lineWidth = 1.6; // scrolling vine between the flowers
      for (const y0 of [128, 0, 256]) {
        ctx.beginPath(); ctx.moveTo(0, y0);
        for (let x = 0; x <= SIZE; x += 8) ctx.lineTo(x, y0 + Math.sin(x / 20) * 9);
        ctx.stroke();
      }
      break;
    }
    case 'floral': {
      fill(base);
      const blossom = (x: number, y: number, r: number, rot: number, col: string) => {
        ctx.fillStyle = shade(a2, 0.15); // leaves with a midrib
        for (const la of [rot + 0.7, rot + 2.4, rot + 4.2]) {
          ctx.save(); ctx.translate(x + Math.cos(la) * r * 1.1, y + Math.sin(la) * r * 1.1); ctx.rotate(la);
          ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = shade(a2, -0.25); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
          ctx.restore();
        }
        for (let k = 0; k < 6; k++) { // petals with a soft centre-to-edge gradient
          const a = rot + (k / 6) * Math.PI * 2, px = x + Math.cos(a) * r * 0.52, py = y + Math.sin(a) * r * 0.52;
          const g = ctx.createRadialGradient(x, y, r * 0.1, px, py, r * 0.62);
          g.addColorStop(0, shade(col, -0.25)); g.addColorStop(1, col);
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, r * 0.58, r * 0.4, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = shade(a2, 0.1); ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f2d27a'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.26) * r * 0.1, y + Math.sin(k * 1.26) * r * 0.1, r * 0.035, 0, Math.PI * 2); ctx.fill(); }
      };
      const spots: [number, number, number][] = [[50, 52, 26], [170, 38, 20], [110, 120, 28], [225, 128, 22], [40, 190, 22], [150, 214, 27]];
      spots.forEach(([x, y, r], i) => wrapped(SIZE, x, y, r * 2.2, (px, py) => blossom(px, py, r, i * 1.1 + rand(), i % 3 === 2 ? shade(a1, -0.12) : a1)));
      for (let i = 0; i < 26; i++) { // buds and small leaves
        ctx.fillStyle = i % 2 ? shade(a1, -0.08) : shade(a2, 0.2);
        wrapped(SIZE, rand() * SIZE, rand() * SIZE, 8, (x, y) => { ctx.beginPath(); ctx.ellipse(x, y, 2 + rand() * 3, 1.3 + rand() * 1.5, rand() * 6, 0, Math.PI * 2); ctx.fill(); });
      }
      grain(ctx, rand, 500, 0.03);
      break;
    }
    case 'plaid': {
      fill(base);
      const band = (pos: number, w: number, color: string, alpha: number) => {
        ctx.globalAlpha = alpha; ctx.fillStyle = color;
        ctx.fillRect(pos, 0, w, SIZE); ctx.fillRect(0, pos, SIZE, w);
        ctx.globalAlpha = 1;
      };
      band(16, 48, a1, 0.5); band(144, 48, a1, 0.5); // wide soft bands (overlap darkens at crossings)
      band(80, 12, a2, 0.55); band(208, 12, a2, 0.55);
      band(36, 3, a2, 0.7); band(164, 3, a2, 0.7);
      ctx.lineWidth = 1.2; // twill grain over everything
      for (let i = -SIZE; i < SIZE * 2; i += 4) {
        ctx.strokeStyle = (i / 4) % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.1)';
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - SIZE, SIZE); ctx.stroke();
      }
      break;
    }
    default: // solid: plain cotton
      fill(base);
      weave(ctx, 4, 0.035);
      grain(ctx, rand, 1200, 0.03);
  }
  const det = DETAIL_OF[f.kind], photo = det && details.get(det[0]);
  if (det && photo) {
    const [, strength, repeat] = det, s = SIZE / repeat;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = strength;
    for (let y = 0; y < repeat; y++) for (let x = 0; x < repeat; x++) ctx.drawImage(photo, x * s, y * s, s, s);
    ctx.restore();
  }
}

function key(f: Fabric) {
  return `${f.kind}|${f.colors.join(',')}|${f.image ?? ''}|${f.image && images.has(f.image) ? 1 : 0}`;
}

export function fabricTile(f: Fabric): HTMLCanvasElement {
  const k = key(f);
  let c = cache.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = f.kind === 'image' ? 512 : SIZE;
    draw(f, c);
    if (cache.size > 24) {
      const first = cache.keys().next().value!;
      cache.get(first)!.width = 0; cache.delete(first); dataCache.delete(first); mips.delete(first);
    }
    cache.set(k, c);
  }
  return c;
}

interface Level { data: Uint8ClampedArray; w: number; h: number }
const mips = new Map<string, Level[]>();

function halve(l: Level): Level {
  const w = Math.max(1, l.w >> 1), h = Math.max(1, l.h >> 1), out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      const i = ((y * 2) * l.w + x * 2) * 4 + c;
      out[(y * w + x) * 4 + c] = (l.data[i] + l.data[i + 4] + l.data[i + l.w * 4] + l.data[i + l.w * 4 + 4]) / 4;
    }
  }
  return { data: out, w, h };
}

/**
 * The tile prepared for a given minification: when the cloth is drawn smaller than the tile
 * (ts = tile px per output px > 1) a pre-averaged level is used, which removes moiré stripes.
 * Returns the level and the remaining scale to sample it at.
 */
export function fabricTileFor(f: Fabric, ts: number): Level & { ts: number } {
  const k = key(f), base = fabricTileData(f);
  let chain = mips.get(k);
  if (!chain) { chain = [base]; mips.set(k, chain); }
  const want = ts > 1 ? Math.min(5, Math.floor(Math.log2(ts))) : 0;
  while (chain.length <= want) chain.push(halve(chain[chain.length - 1]));
  const lvl = chain[want];
  return { ...lvl, ts: ts / 2 ** want };
}

/** The tile's pixels, for the per-pixel lighting. */
export function fabricTileData(f: Fabric): { data: Uint8ClampedArray; w: number; h: number } {
  const c = fabricTile(f), k = key(f);
  let d = dataCache.get(k);
  if (!d) {
    const img = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
    d = { data: img.data, w: c.width, h: c.height };
    dataCache.set(k, d);
  }
  return d;
}
