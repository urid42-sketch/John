import { fabricTile, fabricTileFor, shade as tint } from './fabricTiles';
import { along, lerp, rng } from './geometry';
import { shade as shadePixels, type ShadeMode } from './shade';
import type { Detail, Fabric, GarmentDesign, GarmentGeometry, Piece, Pt } from './types';

/**
 * Canvas 2D renderer (no SVG filters, no ctx.filter: both are unreliable on Safari).
 * Each piece is lit per pixel from a height field (see shade.ts); seams and details come after.
 */
export function renderGarment(g: GarmentGeometry, design: GarmentDesign, scale: number, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? document.createElement('canvas');
  const w = Math.max(1, Math.ceil(g.bbox.w * scale)), h = Math.max(1, Math.ceil(g.bbox.h * scale));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const f = design.fabric;
  for (const p of g.pieces) drawPiece(ctx, p, f, g, design.seed, scale);
  ctx.setTransform(scale, 0, 0, scale, -g.bbox.x * scale, -g.bbox.y * scale);
  for (const d of design.details) drawDetail(ctx, d, g, design);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function drawPiece(
  main: CanvasRenderingContext2D, p: Piece, f: Fabric, g: GarmentGeometry, seed: number, scale: number,
) {
  const u = g.unit, b = p.box, pad = 3;
  const pw = Math.max(1, Math.ceil(b.w * scale) + pad * 2), ph = Math.max(1, Math.ceil(b.h * scale) + pad * 2);
  const pc = document.createElement('canvas');
  pc.width = pw; pc.height = ph;
  const ctx = pc.getContext('2d', { willReadFrequently: true })!;
  const path = new Path2D(p.d);
  const toLocal = () => ctx.setTransform(scale, 0, 0, scale, -b.x * scale + pad, -b.y * scale + pad);

  // 1. the piece's mask
  toLocal();
  ctx.fillStyle = '#fff';
  ctx.fill(path);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const mask = ctx.getImageData(0, 0, pw, ph).data;
  const alpha = new Uint8ClampedArray(pw * ph);
  for (let i = 0; i < alpha.length; i++) alpha[i] = mask[i * 4 + 3];

  // 2. per-pixel cloth
  const X = (x: number) => (x - b.x) * scale + pad, Y = (y: number) => (y - b.y) * scale + pad;
  const mode: ShadeMode = f.kind === 'satin' ? 'satin' : f.kind === 'velvet' ? 'velvet' : f.kind === 'lace' ? 'lace' : 'matte';
  const k = (u / 82) * 0.55 * f.scale; // garment units per tile pixel
  const R = u * scale * 0.85;
  const lining = f.kind === 'lace' ? lace(f.colors[0]) : undefined;
  const tile = fabricTileFor(f, 1 / (scale * k));
  const px = shadePixels({
    w: pw, h: ph, alpha, R,
    folds: p.folds.map((fo) => ({ ax: X(fo.a.x), ay: Y(fo.a.y), bx: X(fo.b.x), by: Y(fo.b.y), width: fo.width * scale, depth: fo.depth })),
    bumps: (p.bumps ?? []).map((bu) => ({ x: X(bu.x), y: Y(bu.y), r: bu.r * scale, a: bu.a })),
    drape: p.drape ? { ...p.drape, cx: X(p.drape.cx), y0: Y(p.drape.y0), reach: p.drape.reach * scale } : undefined,
    tile: tile.data, tw: tile.w, th: tile.h,
    ox: b.x * scale - pad, oy: b.y * scale - pad, ts: tile.ts, warp: R * 0.5,
    sheen: f.sheen, mode, lining,
  });
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px), pw, ph), 0, 0);

  // 3. seams, stitching and a thin turned edge, only where there is cloth
  ctx.globalCompositeOperation = 'source-atop';
  toLocal();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const lw = Math.max(0.9 / scale, u * 0.017);
  for (const line of p.lines ?? []) {
    const lp = new Path2D(line.d);
    ctx.setLineDash(line.dash ? [u * 0.05, u * 0.04] : []);
    ctx.save();
    ctx.translate(0, lw * 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = lw; ctx.stroke(lp);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = lw; ctx.stroke(lp);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(30,14,10,0.3)';
  ctx.lineWidth = Math.max(1.2 / scale, u * 0.03);
  ctx.stroke(path);
  if (f.sequins > 0.02) sparkle(ctx, b.x, b.y, b.w, b.h, u, f.sequins, seed + p.id.length, f.colors[0]);
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  main.drawImage(pc, (b.x - g.bbox.x) * scale - pad, (b.y - g.bbox.y) * scale - pad);
  pc.width = 0; pc.height = 0;
}

/** Slip colour under lace: a warm, slightly deeper version of the lace colour. */
function lace(base: string): [number, number, number] {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(tint(base, 0.25));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [225, 200, 190];
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u: number, amount: number, seed: number, base: string) {
  const rand = rng(seed * 31 + 5);
  const r = Math.max(0.8, u * 0.028);
  const n = Math.min(2600, Math.round(((w * h) / (r * r * 9)) * amount));
  for (let i = 0; i < n; i++) {
    const px = x + rand() * w, py = y + rand() * h, t = rand();
    ctx.fillStyle = t > 0.8 ? 'rgba(255,255,255,0.95)' : t > 0.45 ? tint(base, 0.45) : tint(base, -0.3);
    ctx.beginPath(); ctx.arc(px, py, r * (0.7 + rand() * 0.7), 0, Math.PI * 2); ctx.fill();
  }
}

/** Where a detail sits, in garment coordinates. */
export function detailPoint(d: Detail, g: GarmentGeometry): Pt {
  return { x: g.bbox.x + d.x * g.bbox.w, y: g.bbox.y + d.y * g.bbox.h };
}

function drawDetail(ctx: CanvasRenderingContext2D, d: Detail, g: GarmentGeometry, design: GarmentDesign) {
  const u = g.unit, s = d.size;
  const dark = tint(d.color, -0.35), light = tint(d.color, 0.35);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (d.kind) {
    case 'belt': {
      // follows the waist curve; y shifts it up or down
      const [a, m, b] = g.curves.waist;
      const off = (d.y - 0.5) * g.bbox.h * 0.5, t = u * 0.13 * s;
      const band = (dy: number) => { ctx.beginPath(); ctx.moveTo(a.x, a.y + off + dy); ctx.quadraticCurveTo(m.x, m.y + off + dy + u * 0.06, b.x, b.y + off + dy); };
      ctx.lineCap = 'butt';
      ctx.lineWidth = t; ctx.strokeStyle = d.color; band(0); ctx.stroke();
      ctx.lineWidth = t * 0.16; ctx.strokeStyle = dark; band(t * 0.42); ctx.stroke();
      ctx.strokeStyle = light; band(-t * 0.38); ctx.stroke();
      const bx = lerp(a.x, b.x, d.x), by = m.y + off + u * 0.03, bw = t * 1.25;
      ctx.fillStyle = '#d9b36a'; ctx.strokeStyle = '#8a6a2c'; ctx.lineWidth = t * 0.12;
      ctx.beginPath(); ctx.rect(bx - bw / 2, by - t * 0.72, bw, t * 1.44); ctx.fill(); ctx.stroke();
      ctx.fillStyle = d.color; ctx.fillRect(bx - bw * 0.26, by - t * 0.42, bw * 0.52, t * 0.84);
      break;
    }
    case 'buttons': {
      const n = Math.max(1, Math.round(d.n ?? 5)), len = d.len ?? 0.5, r = u * 0.05 * s;
      for (let i = 0; i < n; i++) {
        const t = d.y + (n === 1 ? 0 : (i / (n - 1)) * len);
        const p = along(g.curves.front, Math.min(1, t)).p;
        const x = p.x + (d.x - 0.5) * g.bbox.w;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x + r * 0.2, p.y + r * 0.3, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = dark; ctx.lineWidth = r * 0.18; ctx.stroke();
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x - r * 0.3, p.y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark;
        for (const ox of [-1, 1]) { ctx.beginPath(); ctx.arc(x + ox * r * 0.28, p.y, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case 'zipper': {
      const len = d.len ?? 0.6, w = u * 0.05 * s;
      const p0 = along(g.curves.front, d.y).p, p1 = along(g.curves.front, Math.min(1, d.y + len)).p;
      const x = p0.x + (d.x - 0.5) * g.bbox.w;
      ctx.strokeStyle = dark; ctx.lineWidth = w * 1.5; ctx.beginPath(); ctx.moveTo(x, p0.y); ctx.lineTo(x, p1.y); ctx.stroke();
      ctx.strokeStyle = d.color; ctx.lineWidth = w * 0.9; ctx.setLineDash([w * 0.5, w * 0.5]);
      ctx.beginPath(); ctx.moveTo(x, p0.y); ctx.lineTo(x, p1.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = d.color; ctx.strokeStyle = dark; ctx.lineWidth = w * 0.3;
      ctx.beginPath(); ctx.rect(x - w * 1.1, p0.y - w, w * 2.2, w * 2.2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(x - w * 0.5, p0.y + w * 1.2, w, w * 3); ctx.fill(); ctx.stroke();
      break;
    }
    case 'ruffle': {
      const curve = d.host === 'neckline' ? g.curves.neckline : g.curves.hem;
      const depth = u * 0.3 * s * (d.host === 'neckline' ? 0.6 : 1);
      const waves = Math.max(6, Math.round((curveLength(curve) / (u * 0.3)) / Math.max(0.5, s)));
      const N = waves * 6;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const { p } = along(curve, i / N); if (i) ctx.lineTo(p.x, p.y - depth * 0.15); else ctx.moveTo(p.x, p.y - depth * 0.15); }
      for (let i = N; i >= 0; i--) {
        const { p } = along(curve, i / N);
        ctx.lineTo(p.x, p.y + depth * (0.75 + 0.25 * Math.cos((i / N) * waves * Math.PI * 2)));
      }
      ctx.closePath();
      const tile = fabricTile({ ...design.fabric, colors: [d.color, ...design.fabric.colors.slice(1)] });
      ctx.save(); ctx.clip();
      const pat = ctx.createPattern(tile, 'repeat');
      ctx.fillStyle = pat ?? d.color;
      const bb = g.bbox; ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < waves; i++) { // one soft shadow per scallop
        const { p } = along(curve, (i + 0.5) / waves), hw = (curveLength(curve) / waves) / 2;
        const gr = ctx.createLinearGradient(p.x - hw, 0, p.x + hw, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = gr; ctx.fillRect(p.x - hw, p.y - depth, hw * 2, depth * 2.4);
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = Math.max(1, u * 0.02); ctx.stroke();
      break;
    }
    case 'bow': {
      const c = detailPoint(d, g), r = u * 0.34 * s;
      const wing = (dir: 1 | -1) => {
        ctx.beginPath(); ctx.moveTo(c.x, c.y);
        ctx.bezierCurveTo(c.x + dir * r * 0.5, c.y - r * 0.9, c.x + dir * r * 1.25, c.y - r * 0.75, c.x + dir * r * 1.15, c.y);
        ctx.bezierCurveTo(c.x + dir * r * 1.25, c.y + r * 0.75, c.x + dir * r * 0.5, c.y + r * 0.9, c.x, c.y);
        const gr = ctx.createLinearGradient(c.x, 0, c.x + dir * r * 1.2, 0);
        gr.addColorStop(0, dark); gr.addColorStop(0.45, d.color); gr.addColorStop(1, light);
        ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = r * 0.05; ctx.stroke();
      };
      const tail = (dir: 1 | -1) => {
        ctx.beginPath(); ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + dir * r * 0.75, c.y + r * 1.35); ctx.lineTo(c.x + dir * r * 0.42, c.y + r * 1.2); ctx.lineTo(c.x + dir * r * 0.25, c.y + r * 1.45);
        ctx.closePath(); ctx.fillStyle = tint(d.color, -0.12); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = r * 0.05; ctx.stroke();
      };
      tail(1); tail(-1); wing(1); wing(-1);
      ctx.fillStyle = d.color; ctx.strokeStyle = dark;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 0.2, r * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case 'embroidery': {
      const c = detailPoint(d, g), r = u * 0.3 * s, motif = Math.round(d.n ?? 0) % 3;
      ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.lineWidth = Math.max(1, r * 0.07);
      const leaf = (x: number, y: number, a: number, len: number) => { ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2, len / 2, len * 0.2, a, 0, Math.PI * 2); ctx.fill(); };
      if (motif === 0) { // sprig
        ctx.beginPath(); ctx.moveTo(c.x, c.y + r); ctx.quadraticCurveTo(c.x + r * 0.3, c.y, c.x, c.y - r); ctx.stroke();
        for (let i = 0; i < 4; i++) { const y = c.y + r * (0.6 - i * 0.42), x = c.x + r * 0.16 * Math.sin(i + 1); leaf(x, y, -0.6, r * 0.55); leaf(x, y, Math.PI + 0.6, r * 0.55); }
      } else if (motif === 1) { // rosette
        for (let k = 0; k < 8; k++) leaf(c.x, c.y, (k / 8) * Math.PI * 2, r * 0.95);
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.2, 0, Math.PI * 2); ctx.fill();
      } else { // heart
        ctx.beginPath(); ctx.moveTo(c.x, c.y + r * 0.8);
        ctx.bezierCurveTo(c.x - r * 1.3, c.y - r * 0.1, c.x - r * 0.6, c.y - r, c.x, c.y - r * 0.35);
        ctx.bezierCurveTo(c.x + r * 0.6, c.y - r, c.x + r * 1.3, c.y - r * 0.1, c.x, c.y + r * 0.8);
        ctx.fill();
      }
      // stitch texture
      ctx.globalCompositeOperation = 'source-atop';
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = Math.max(0.6, r * 0.03);
      for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(c.x + i * r * 0.2 - r, c.y - r); ctx.lineTo(c.x + i * r * 0.2 + r, c.y + r); ctx.stroke(); }
      break;
    }
    case 'sequins': {
      const c = detailPoint(d, g), r = u * 0.5 * s;
      const rand = rng(design.seed + 99);
      const dot = Math.max(0.8, u * 0.03);
      for (let i = 0; i < 260; i++) {
        const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r, t = rand();
        ctx.fillStyle = t > 0.75 ? 'rgba(255,255,255,0.95)' : t > 0.4 ? light : d.color;
        ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, dot * (0.7 + rand() * 0.8), 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

function curveLength(pts: Pt[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return t || 1;
}

/** Stand-in geometry for an imported (raster) garment, so the same details library works on it. */
export function rasterGeometry(x: number, y: number, w: number, h: number): GarmentGeometry {
  const cx = x + w / 2;
  return {
    pieces: [], unit: w * 0.25, bbox: { x, y, w, h },
    curves: {
      waist: [{ x: x + w * 0.12, y: y + h * 0.5 }, { x: cx, y: y + h * 0.5 }, { x: x + w * 0.88, y: y + h * 0.5 }],
      hem: [{ x: x + w * 0.04, y: y + h * 0.985 }, { x: cx, y: y + h * 0.985 }, { x: x + w * 0.96, y: y + h * 0.985 }],
      neckline: [{ x: x + w * 0.25, y: y + h * 0.03 }, { x: cx, y: y + h * 0.07 }, { x: x + w * 0.75, y: y + h * 0.03 }],
      front: [{ x: cx, y }, { x: cx, y: y + h }],
    },
  };
}

export function drawDetails(ctx: CanvasRenderingContext2D, g: GarmentGeometry, design: GarmentDesign) {
  for (const d of design.details) drawDetail(ctx, d, g, design);
}
