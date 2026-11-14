// Per-pixel cloth lighting. Pure typed-array code (no DOM), so it can be tested in node.
//
// Idea: instead of pasting gradients on a flat shape, build a HEIGHT FIELD for each garment piece
// (rounded toward the edges like a tube of cloth, plus folds, pleats and bust shaping), derive a
// surface normal from it, and light that with a key light. Folds, sheen and shadows then come out
// of one consistent model, and printed fabrics can be bent along the folds.

export interface FoldPx { ax: number; ay: number; bx: number; by: number; width: number; depth: number }
export interface BumpPx { x: number; y: number; r: number; a: number }
export interface DrapePx { cx: number; y0: number; reach: number; amount: number; n: number; phase: number }
export type ShadeMode = 'satin' | 'matte' | 'velvet' | 'lace';

export interface ShadeInput {
  w: number; h: number;
  alpha: Uint8ClampedArray; // piece mask, w*h, 0..255
  R: number; // rounding radius in px (about the size of the piece's half-width)
  folds: FoldPx[]; bumps: BumpPx[]; drape?: DrapePx;
  tile: Uint8ClampedArray; tw: number; th: number; // RGBA fabric tile
  /** canvas pixel (x, y) → tile coordinate ((x + ox) * ts, (y + oy) * ts) */
  ox: number; oy: number; ts: number;
  warp: number; // px the print moves per unit of surface slope
  sheen: number; // 0..1
  mode: ShadeMode;
  lining?: [number, number, number]; // lace: colour of the slip under the net
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a || 1), 0, 1); return t * t * (3 - 2 * t); };

/** Euclidean-ish distance (chamfer 1 / √2) from each inside pixel to the nearest outside pixel. */
export function distanceField(alpha: Uint8ClampedArray, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h), INF = 1e6, R2 = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = alpha[i] >= 128 ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i] === 0) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) {
      v = Math.min(v, d[i - w] + 1);
      if (x > 0) v = Math.min(v, d[i - w - 1] + R2);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + R2);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (d[i] === 0) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + 1);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + R2);
      if (x > 0) v = Math.min(v, d[i + w - 1] + R2);
    }
    d[i] = v;
  }
  return d;
}

/** Separable box blur with edge clamping. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    const row = y * w;
    for (let k = -r; k <= r; k++) s += src[row + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** The height field alone (exported for tests): rounded edge + bust + folds + pleats. */
export function heightField(inp: ShadeInput, dist: Float32Array): Float32Array {
  const { w, h, R, folds, bumps, drape } = inp;
  const H = new Float32Array(w * h);
  let maxD = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  const Re = Math.max(2, Math.min(R, maxD * 0.92)); // narrow pieces (sleeves) become round tubes
  // Base roundness, row by row: every horizontal run of cloth is a soft cylinder. (Rounding by
  // distance to the nearest edge leaves a sharp crease along the middle of a tapered shape.)
  for (let y = 0; y < h; y++) {
    let x = 0;
    const row = y * w;
    while (x < w) {
      if (inp.alpha[row + x] < 128) { x++; continue; }
      let e = x;
      while (e < w && inp.alpha[row + e] >= 128) e++;
      const l = x, r = e - 1, half = (r - l + 1) / 2, Rr = Math.max(1, Math.min(R, half));
      for (let k = l; k <= r; k++) {
        const t = Math.min(Math.min(k - l + 0.5, r - k + 0.5) / Rr, 1);
        H[row + k] = Rr * 0.5 * (1 - (1 - t) * (1 - t));
      }
      x = e;
    }
  }
  // smooth the base first (row steps along slanted edges would show as faint bands), then add relief
  H.set(boxBlur(H, w, h, Math.max(3, Math.round(Re * 0.12))));
  for (const b of bumps) {
    const r = Math.max(2, b.r), x0 = Math.max(0, Math.floor(b.x - r * 2.5)), x1 = Math.min(w - 1, Math.ceil(b.x + r * 2.5));
    const y0 = Math.max(0, Math.floor(b.y - r * 2.5)), y1 = Math.min(h - 1, Math.ceil(b.y + r * 2.5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (dist[i] <= 0) continue;
      const dx = x - b.x, dy = y - b.y;
      H[i] += b.a * Re * 0.5 * Math.exp(-(dx * dx + dy * dy) / (r * r));
    }
  }
  for (const f of folds) {
    const dx = f.bx - f.ax, dy = f.by - f.ay, len = Math.hypot(dx, dy);
    if (len < 2) continue;
    const ux = dx / len, uy = dy / len, wd = Math.max(1.5, f.width);
    const x0 = Math.max(0, Math.floor(Math.min(f.ax, f.bx) - wd * 3)), x1 = Math.min(w - 1, Math.ceil(Math.max(f.ax, f.bx) + wd * 3));
    const y0 = Math.max(0, Math.floor(Math.min(f.ay, f.by) - wd * 3)), y1 = Math.min(h - 1, Math.ceil(Math.max(f.ay, f.by) + wd * 3));
    const amp = f.depth * Re * 0.2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (dist[i] <= 0) continue;
      const px = x - f.ax, py = y - f.ay;
      const along = (px * ux + py * uy) / len;
      if (along < 0 || along > 1) continue;
      const s = (px * -uy + py * ux) / wd;
      const taper = Math.pow(Math.sin(Math.PI * along), 0.6);
      // a ridge with a valley on one side: reads as a real pleat under side light
      H[i] += amp * taper * Math.exp(-s * s) * (0.85 + 0.55 * s);
    }
  }
  if (drape && drape.amount > 0.001) {
    const A = drape.amount * Re * 0.12;
    for (let y = Math.max(0, Math.floor(drape.y0)); y < h; y++) {
      const fy = y - drape.y0;
      const grow = smooth(0, drape.reach * 0.55, fy);
      if (grow <= 0) continue;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (dist[i] <= 0) continue;
        const dx = x - drape.cx, dy = fy + drape.reach * 0.12;
        const th = Math.atan2(dx, dy), r = Math.hypot(dx, dy);
        const ph = th * drape.n + drape.phase + 0.9 * Math.sin(th * drape.n * 0.37 + r * 0.011);
        const wave = Math.sin(ph) + 0.35 * Math.sin(ph * 2 + 1.3);
        H[i] += A * grow * Math.min(1, r / (drape.reach * 0.45)) * wave;
      }
    }
  }
  return boxBlur(H, w, h, Math.max(1, Math.round(Re * 0.03)));
}

export function shade(inp: ShadeInput): Uint8ClampedArray {
  const { w, h, alpha, tile, tw, th, ox, oy, ts, warp, sheen, mode, R } = inp;
  const dist = distanceField(alpha, w, h);
  const H = heightField(inp, dist);
  let maxD = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  const Re = Math.max(2, Math.min(R, maxD * 0.92));
  const Hb = boxBlur(H, w, h, Math.max(2, Math.round(Re * 0.2)));
  const dAo = boxBlur(dist, w, h, 2); // chamfer distances have faint terraces on slanted edges
  const out = new Uint8ClampedArray(w * h * 4);

  // key light from the upper left, slightly toward the viewer
  const L = (() => { const x = -0.5, y = -0.6, z = 0.62, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();
  const hv = (() => { const x = L[0], y = L[1], z = L[2] + 1, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })(); // half vector (view = +z)
  const velvet = mode === 'velvet', satin = mode === 'satin';
  const amb = velvet ? 0.52 : satin ? 0.42 : 0.46;
  const kd = velvet ? 0.6 : satin ? 0.85 : 0.8;
  const norm = amb + kd * L[2];
  const shin = satin ? 20 : 10, specK = satin ? 0.5 * sheen : mode === 'matte' || mode === 'lace' ? 0.07 * sheen : 0;
  const specBroad = satin ? 0.3 * sheen : 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = alpha[i];
      if (a === 0) continue;
      const xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x, yu = y > 0 ? y - 1 : y, yd = y < h - 1 ? y + 1 : y;
      const gx = (H[y * w + xr] - H[y * w + xl]) / (xr - xl || 1);
      const gy = (H[yd * w + x] - H[yu * w + x]) / (yd - yu || 1);
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inv, ny = -gy * inv, nz = inv;

      // fabric colour, bent along the folds
      let u = (x + ox + nx * warp) * ts, v = (y + oy + ny * warp) * ts;
      u = u - Math.floor(u / tw) * tw; v = v - Math.floor(v / th) * th;
      const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
      const u1 = (u0 + 1) % tw, v1 = (v0 + 1) % th;
      const p00 = (v0 * tw + u0) * 4, p10 = (v0 * tw + u1) * 4, p01 = (v1 * tw + u0) * 4, p11 = (v1 * tw + u1) * 4;
      const mixc = (c: number) =>
        (tile[p00 + c] * (1 - fu) + tile[p10 + c] * fu) * (1 - fv) + (tile[p01 + c] * (1 - fu) + tile[p11 + c] * fu) * fv;
      let r = mixc(0), g = mixc(1), b = mixc(2);
      const ta = mixc(3) / 255;

      const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      let ao = 0.8 + 0.2 * smooth(0, Re * 0.55, dAo[i]);
      ao *= 1 - 0.3 * clamp((Hb[i] - H[i]) / (Re * 0.07), 0, 1); // valleys of folds are darker
      const lum = (amb + kd * diff) / norm * ao;
      r *= lum; g *= lum; b *= lum;

      if (specK > 0 || specBroad > 0) {
        const nh = Math.max(0, nx * hv[0] + ny * hv[1] + nz * hv[2]);
        const sp = specK * Math.pow(nh, shin) + specBroad * Math.pow(nh, 5);
        const tint = 0.65; // satin highlights keep some of the cloth colour
        r += sp * (255 * tint + r * (1 - tint)); g += sp * (255 * tint + g * (1 - tint)); b += sp * (255 * tint + b * (1 - tint));
      }
      if (velvet) { // pile catches light at grazing angles
        const rim = Math.pow(1 - nz, 1.6) * 0.6 * (0.4 + 0.6 * sheen);
        r += rim * (r * 0.8 + 38); g += rim * (g * 0.8 + 38); b += rim * (b * 0.8 + 38);
      }

      let alphaOut = a / 255;
      if (mode === 'lace' && inp.lining) {
        const la = 0.55, ca = ta + la * (1 - ta);
        const [lr, lg, lb] = inp.lining;
        const ll = lum;
        r = (r * ta + lr * ll * la * (1 - ta)) / ca; g = (g * ta + lg * ll * la * (1 - ta)) / ca; b = (b * ta + lb * ll * la * (1 - ta)) / ca;
        alphaOut *= ca;
      } else alphaOut *= ta;
      const o = i * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = alphaOut * 255;
    }
  }
  return out;
}
