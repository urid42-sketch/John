import { rng } from './geometry';
import type { Fabric } from './types';

const SIZE = 256;
const cache = new Map<string, HTMLCanvasElement>();
/** User-uploaded fabric images, registered by the studio once decoded. */
const images = new Map<string, HTMLCanvasElement>();

export function registerFabricImage(blobId: string, canvas: HTMLCanvasElement) {
  images.set(blobId, canvas);
  for (const k of [...cache.keys()]) if (k.includes(blobId)) cache.delete(k);
}
export const hasFabricImage = (blobId: string) => images.has(blobId);

function shade(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Draw `fn` at (x,y) and at its wrapped copies, so stamps crossing the edge tile seamlessly. */
function wrapped(x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) {
    const px = x + dx, py = y + dy;
    if (px > -r && px < SIZE + r && py > -r && py < SIZE + r) fn(px, py);
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
      // mirrored 2×2 so any photo tiles without visible seams
      const h = SIZE / 2;
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        ctx.save();
        ctx.translate(sx ? SIZE : 0, sy ? SIZE : 0);
        ctx.scale(sx ? -1 : 1, sy ? -1 : 1);
        ctx.drawImage(img, 0, 0, h, h);
        ctx.restore();
      }
      break;
    }
    case 'satin': {
      fill(base);
      for (let i = 0; i < 14; i++) {
        const x = rand() * SIZE, w = 14 + rand() * 40;
        const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
        const col = i % 2 ? '255,255,255' : '0,0,0';
        g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},${0.05 + rand() * 0.06})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        wrapped(x, 0, w, (px) => ctx.fillRect(px - w, 0, w * 2, SIZE));
      }
      break;
    }
    case 'denim': {
      fill(base);
      ctx.lineWidth = 1.4;
      for (let i = -SIZE; i < SIZE * 2; i += 4) {
        ctx.strokeStyle = (i / 4) % 2 ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,30,0.16)';
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - SIZE, SIZE); ctx.stroke();
      }
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,40,0.12)';
        ctx.fillRect(rand() * SIZE, rand() * SIZE, 1.5, 1 + rand() * 4);
      }
      break;
    }
    case 'lace': {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 0.28; fill(base); ctx.globalAlpha = 1; // sheer net: skin shows through
      ctx.strokeStyle = base; ctx.fillStyle = base;
      ctx.lineWidth = 0.8;
      for (let i = 0; i <= SIZE; i += 16) { // fine net
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke();
      }
      const flower = (x: number, y: number, r: number) => {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.24, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      };
      for (const [x, y] of [[64, 64], [192, 64], [0, 192], [128, 192], [256, 192]]) wrapped(x, y, 40, (px, py) => flower(px, py, 30));
      ctx.lineWidth = 1.6;
      for (const [x, y] of [[128, 64], [0, 64], [64, 192], [192, 192]]) wrapped(x, y, 20, (px, py) => { ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.stroke(); });
      break;
    }
    case 'floral': {
      fill(base);
      for (let i = 0; i < 9; i++) {
        const x = rand() * SIZE, y = rand() * SIZE, r = 14 + rand() * 12, rot = rand() * 6;
        wrapped(x, y, r * 1.6, (px, py) => {
          ctx.fillStyle = shade(a2, 0.25); // leaves
          for (const la of [rot + 0.6, rot + 3.4]) { ctx.beginPath(); ctx.ellipse(px + Math.cos(la) * r, py + Math.sin(la) * r, r * 0.6, r * 0.24, la, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = a1;
          for (let k = 0; k < 5; k++) {
            const a = rot + (k / 5) * Math.PI * 2;
            ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5, r * 0.5, r * 0.34, a, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = a2; ctx.beginPath(); ctx.arc(px, py, r * 0.2, 0, Math.PI * 2); ctx.fill();
        });
      }
      break;
    }
    case 'plaid': {
      fill(base);
      const band = (pos: number, w: number, color: string, alpha: number) => {
        ctx.globalAlpha = alpha; ctx.fillStyle = color;
        ctx.fillRect(pos, 0, w, SIZE); ctx.fillRect(0, pos, SIZE, w);
        ctx.globalAlpha = 1;
      };
      band(20, 44, a1, 0.45); band(148, 44, a1, 0.45);
      band(84, 10, a2, 0.5); band(212, 10, a2, 0.5);
      band(40, 3, a2, 0.6); band(168, 3, a2, 0.6);
      break;
    }
    default: fill(base);
  }
  if (f.kind !== 'lace' && f.kind !== 'image') { // faint weave grain so "solid" is never flat
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(rand() * SIZE, rand() * SIZE, 1 + rand() * 2, 1);
    }
  }
}

export function fabricTile(f: Fabric): HTMLCanvasElement {
  const key = `${f.kind}|${f.colors.join(',')}|${f.image ?? ''}|${f.image && images.has(f.image) ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    draw(f, c);
    if (cache.size > 24) { const first = cache.keys().next().value!; cache.get(first)!.width = 0; cache.delete(first); }
    cache.set(key, c);
  }
  return c;
}
export { shade };
