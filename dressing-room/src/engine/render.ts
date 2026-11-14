import { fabricTile, shade } from './fabricTiles';
import { along, lerp, rng } from './geometry';
import type { Detail, Fabric, GarmentDesign, GarmentGeometry, Piece, Pt } from './types';

/**
 * Canvas 2D renderer (no SVG filters, no ctx.filter: both are unreliable on Safari).
 * All shading uses `source-atop`, so it only lands on fabric pixels and lace stays see-through.
 */
export function renderGarment(g: GarmentGeometry, design: GarmentDesign, scale: number, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? document.createElement('canvas');
  const w = Math.max(1, Math.ceil(g.bbox.w * scale)), h = Math.max(1, Math.ceil(g.bbox.h * scale));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, -g.bbox.x * scale, -g.bbox.y * scale);
  const tile = fabricTile(design.fabric);
  for (const p of g.pieces) drawPiece(ctx, p, design.fabric, tile, g, design.seed);
  for (const d of design.details) drawDetail(ctx, d, g, design);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, f: Fabric, tile: HTMLCanvasElement, g: GarmentGeometry, seed: number) {
  const path = new Path2D(p.d);
  const u = g.unit, b = p.box;
  ctx.save();
  ctx.clip(path);

  // 1. cloth
  const pattern = ctx.createPattern(tile, 'repeat');
  const k = (u / 82) * 0.55 * f.scale; // keep the print the same size relative to the body
  if (pattern && 'setTransform' in pattern) {
    pattern.setTransform(new DOMMatrix().translate(b.x, b.y).scale(k));
    ctx.fillStyle = pattern;
  } else ctx.fillStyle = pattern ?? f.colors[0];
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);

  ctx.globalCompositeOperation = 'source-atop';
  const small = p.id.startsWith('strap');

  // 2. form: the body is a cylinder: darker toward the sides, a soft highlight off-centre
  if (!small) {
    const form = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    form.addColorStop(0, 'rgba(0,0,0,0.34)'); form.addColorStop(0.2, 'rgba(0,0,0,0.08)');
    form.addColorStop(0.38, 'rgba(255,255,255,0.10)'); form.addColorStop(0.55, 'rgba(0,0,0,0)');
    form.addColorStop(0.82, 'rgba(0,0,0,0.10)'); form.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = form;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }

  // 3. folds: a shadow wedge with a lit ridge beside it
  for (const fold of p.folds) {
    const dx = fold.b.x - fold.a.x, dy = fold.b.y - fold.a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, w = fold.width;
    const grad = ctx.createLinearGradient(fold.b.x - nx * w, fold.b.y - ny * w, fold.b.x + nx * w, fold.b.y + ny * w);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.42, `rgba(0,0,0,${0.3 * fold.depth})`);
    grad.addColorStop(0.5, `rgba(0,0,0,${0.12 * fold.depth})`); grad.addColorStop(0.62, `rgba(255,255,255,${0.22 * fold.depth})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(fold.a.x, fold.a.y);
    ctx.lineTo(fold.b.x - nx * w, fold.b.y - ny * w);
    ctx.lineTo(fold.b.x + nx * w, fold.b.y + ny * w);
    ctx.closePath();
    ctx.fill();
  }

  // 4. sheen: broad diagonal light bands (satin)
  if (f.sheen > 0.02 && !small) {
    for (const [pos, wide] of [[0.3, 0.2], [0.72, 0.13]]) {
      const x = b.x + b.w * pos;
      const sg = ctx.createLinearGradient(x - b.w * wide, b.y, x + b.w * wide, b.y + b.h * 0.25);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, `rgba(255,255,255,${0.42 * f.sheen})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }

  // 5. contact shadows: under the top edge and gathering toward the bottom edge
  if (!small) {
    const top = ctx.createLinearGradient(0, b.y, 0, b.y + Math.min(b.h, u * 0.5));
    top.addColorStop(0, 'rgba(0,0,0,0.16)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top; ctx.fillRect(b.x, b.y, b.w, u * 0.5);
    const bot = ctx.createLinearGradient(0, b.y + b.h - u * 0.45, 0, b.y + b.h);
    bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = bot; ctx.fillRect(b.x, b.y + b.h - u * 0.45, b.w, u * 0.45);
  }

  // 6. all-over sequins
  if (f.sequins > 0.02) sparkle(ctx, b.x, b.y, b.w, b.h, u, f.sequins, seed + p.id.length, f.colors[0]);

  // 7. edge: a thin darker outline reads as a turned hem
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = Math.max(1, u * 0.035);
  ctx.stroke(path);
  ctx.restore();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u: number, amount: number, seed: number, base: string) {
  const rand = rng(seed * 31 + 5);
  const r = Math.max(0.8, u * 0.028);
  const n = Math.min(2600, Math.round(((w * h) / (r * r * 9)) * amount));
  for (let i = 0; i < n; i++) {
    const px = x + rand() * w, py = y + rand() * h, t = rand();
    ctx.fillStyle = t > 0.8 ? 'rgba(255,255,255,0.95)' : t > 0.45 ? shade(base, 0.45) : shade(base, -0.3);
    ctx.beginPath(); ctx.arc(px, py, r * (0.7 + rand() * 0.7), 0, Math.PI * 2); ctx.fill();
  }
}

/** Where a detail sits, in garment coordinates. */
export function detailPoint(d: Detail, g: GarmentGeometry): Pt {
  return { x: g.bbox.x + d.x * g.bbox.w, y: g.bbox.y + d.y * g.bbox.h };
}

function drawDetail(ctx: CanvasRenderingContext2D, d: Detail, g: GarmentGeometry, design: GarmentDesign) {
  const u = g.unit, s = d.size;
  const dark = shade(d.color, -0.35), light = shade(d.color, 0.35);
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
        ctx.closePath(); ctx.fillStyle = shade(d.color, -0.12); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = r * 0.05; ctx.stroke();
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
