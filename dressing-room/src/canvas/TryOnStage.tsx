import Konva from 'konva';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent } from 'react';
import { Image as KImage, Layer, Rect, Stage } from 'react-konva';
import { getBlob, useBlobUrl } from '../db/blobs';
import type { BlobRef, Doll, Garment, ID, PlacedItem, Pt } from '../db/types';
import { ctx2d, decodeToCanvas, releaseCanvas } from '../imaging/load';
import { useFit } from '../ui/useFit';
import { hitsAlpha, normalizeDeg, pinchTransform, toLocalUnit, type AlphaMap } from './gesture';

Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

const MIN_SCALE = 0.03, MAX_SCALE = 1.6;

function useHtmlImage(blob: BlobRef | undefined): HTMLImageElement | null {
  const url = useBlobUrl(blob);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImg(null); return; }
    let alive = true;
    const el = new Image();
    el.onload = () => { if (alive) setImg(el); };
    el.src = url;
    return () => { alive = false; };
  }, [url]);
  return img;
}

/** Low-res alpha maps (from thumbnails) for pixel-accurate hit testing of overlapping garments. */
function useAlphaMaps(garments: Garment[]): Map<ID, AlphaMap> {
  const maps = useRef(new Map<ID, AlphaMap>());
  const [, tick] = useState(0);
  const key = garments.map((g) => g.id).join(',');
  useEffect(() => {
    let alive = true;
    for (const g of garments) {
      if (maps.current.has(g.id)) continue;
      void (async () => {
        try {
          const blob = await getBlob(g.thumb);
          if (!blob) return;
          const c = await decodeToCanvas(blob, 128);
          const d = ctx2d(c, true).getImageData(0, 0, c.width, c.height).data;
          const data = new Uint8Array(c.width * c.height);
          for (let i = 0; i < data.length; i++) data[i] = d[i * 4 + 3];
          maps.current.set(g.id, { w: c.width, h: c.height, data });
          releaseCanvas(c);
          if (alive) tick((n) => n + 1);
        } catch { /* falls back to bounding-box hit testing */ }
      })();
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return maps.current;
}

interface Layout { ox: number; oy: number; dw: number; dh: number }
/** Stage-pixel geometry of an item. */
function geom(it: PlacedItem, g: Garment, L: Layout) {
  const h = it.scale * L.dh;
  const w = h * (g.w / g.h) * it.stretchX;
  return { cx: L.ox + it.x * L.dw, cy: L.oy + it.y * L.dh, w, h };
}

function ItemNode({ item, garment, L }: { item: PlacedItem; garment: Garment; L: Layout }) {
  const img = useHtmlImage(garment.render);
  if (!img) return null;
  const { cx, cy, w, h } = geom(item, garment, L);
  return (
    <KImage
      image={img} x={cx} y={cy} width={garment.w} height={garment.h}
      offsetX={garment.w / 2} offsetY={garment.h / 2}
      scaleX={(w / garment.w) * (item.flipX ? -1 : 1)} scaleY={h / garment.h} rotation={item.rotation}
    />
  );
}

export function TryOnStage({ doll, items, garments, selectedId, onSelect, onChange, stageRef }: {
  doll: Doll;
  items: PlacedItem[];
  garments: Map<ID, Garment>;
  selectedId: ID | null;
  onSelect: (id: ID | null) => void;
  /** `commit` is false while a gesture is in progress */
  onChange: (items: PlacedItem[], commit: boolean) => void;
  stageRef?: React.RefObject<Konva.Stage | null>;
}) {
  const area = useRef<HTMLDivElement>(null);
  const fit = useFit(area, doll.w, doll.h);
  const dollImg = useHtmlImage(doll.cutout);
  // Leave headroom and stand her on the rug of the backdrop instead of filling the whole stage.
  const dw = fit.width * 0.9, dh = fit.height * 0.9;
  const L: Layout = { ox: (fit.cw - dw) / 2, oy: fit.ch * 0.955 - dh, dw, dh };

  const sorted = useMemo(() => [...items].sort((a, b) => a.z - b.z), [items]);
  const used = useMemo(
    () => sorted.map((i) => garments.get(i.garmentId)).filter((g): g is Garment => !!g),
    [sorted, garments],
  );
  const alpha = useAlphaMaps(used);

  // Refs so pointer handlers always see the latest values.
  const live = useRef({ items, L, selectedId });
  live.current = { items, L, selectedId };

  const pos = (e: { clientX: number; clientY: number }): Pt => {
    const r = area.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitTest = (p: Pt): PlacedItem | null => {
    const { items: its, L: lay, selectedId: sel } = live.current;
    const order = [...its].sort((a, b) => (a.id === sel ? -1 : b.id === sel ? 1 : b.z - a.z));
    for (const it of order) {
      const g = garments.get(it.garmentId);
      if (!g) continue;
      const { cx, cy, w, h } = geom(it, g, lay);
      // Finger-sized tolerance (thin items like a necklace are only a few px tall),
      // and a more generous one for the item that is already selected.
      const px = it.id === sel ? 26 : 14;
      const u = toLocalUnit(p, { x: cx, y: cy }, w, h, it.rotation, it.flipX);
      if (hitsAlpha(alpha.get(g.id), u, Math.max(0.04, px / w), Math.max(0.04, px / h))) return it;
    }
    return null;
  };
  const patch = (id: ID, next: Partial<PlacedItem>, commit: boolean) => {
    const items2 = live.current.items.map((i) => (i.id === id ? { ...i, ...next } : i));
    live.current.items = items2; // so a commit right after never uses a stale frame
    onChange(items2, commit);
  };

  type Gesture =
    | { kind: 'drag'; id: ID | null; p0: Pt; start: PlacedItem | null; moved: boolean }
    | { kind: 'pinch'; id: ID; ids: [number, number]; a0: Pt; b0: Pt; start: PlacedItem };
  const pts = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const dirty = useRef(false);

  const beginDrag = (id: ID | null, p: Pt) => {
    const start = id ? live.current.items.find((i) => i.id === id) ?? null : null;
    gesture.current = { kind: 'drag', id: start ? id : null, p0: p, start, moved: false };
  };

  const onDown = (e: RPointerEvent) => {
    // A new primary pointer means no other finger is down: drop anything a missed "up" left behind.
    if (e.isPrimary) { pts.current.clear(); gesture.current = null; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    pts.current.set(e.pointerId, p);
    if (pts.current.size === 1) {
      const hit = hitTest(p);
      if (hit) onSelect(hit.id);
      beginDrag(hit?.id ?? null, p);
    } else if (pts.current.size === 2) {
      const g = gesture.current;
      const id = (g && g.id) ?? live.current.selectedId ?? hitTest(p)?.id ?? null;
      const start = id ? live.current.items.find((i) => i.id === id) : undefined;
      if (!id || !start) return;
      onSelect(id);
      const ids = [...pts.current.keys()] as [number, number];
      gesture.current = { kind: 'pinch', id, ids, a0: pts.current.get(ids[0])!, b0: pts.current.get(ids[1])!, start };
    }
  };

  const onMove = (e: RPointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    const p = pos(e);
    pts.current.set(e.pointerId, p);
    const g = gesture.current;
    const lay = live.current.L;
    if (!g || !lay.dw) return;
    if (g.kind === 'drag') {
      const dx = p.x - g.p0.x, dy = p.y - g.p0.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      if (!g.id || !g.start) return;
      dirty.current = true;
      patch(g.id, { x: g.start.x + dx / lay.dw, y: g.start.y + dy / lay.dh }, false);
    } else {
      const a1 = pts.current.get(g.ids[0]), b1 = pts.current.get(g.ids[1]);
      if (!a1 || !b1) return;
      const s = g.start;
      const next = pinchTransform(
        { x: lay.ox + s.x * lay.dw, y: lay.oy + s.y * lay.dh, scale: s.scale, rotation: s.rotation },
        g.a0, g.b0, a1, b1,
      );
      dirty.current = true;
      patch(g.id, {
        x: (next.x - lay.ox) / lay.dw, y: (next.y - lay.oy) / lay.dh,
        scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale)), rotation: next.rotation,
      }, false);
    }
  };

  const onUp = (e: RPointerEvent) => {
    if (!pts.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (pts.current.size > 0 && g?.kind === 'pinch' && g.ids.includes(e.pointerId)) {
      // One pinch finger lifted: keep dragging with the other one, from where the item is now.
      const rest = g.ids.find((i) => i !== e.pointerId)!;
      const p = pts.current.get(rest);
      for (const k of [...pts.current.keys()]) if (k !== rest) pts.current.delete(k);
      if (p) { beginDrag(g.id, p); if (gesture.current?.kind === 'drag') gesture.current.moved = true; }
      else { pts.current.clear(); gesture.current = null; }
    }
    if (pts.current.size === 0) {
      if (g?.kind === 'drag' && !g.id && !g.moved) onSelect(null);
      gesture.current = null;
      if (dirty.current) { dirty.current = false; onChange(live.current.items, true); }
    }
  };

  // Desktop: wheel resizes the selected item, Shift+wheel rotates it.
  const wheelTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onWheel = (e: WheelEvent) => {
    const id = live.current.selectedId;
    const it = id ? live.current.items.find((i) => i.id === id) : null;
    if (!it) return;
    const delta = e.deltaY || e.deltaX;
    if (e.shiftKey) patch(it.id, { rotation: normalizeDeg(it.rotation + (delta > 0 ? 3 : -3)) }, false);
    else patch(it.id, { scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, it.scale * (delta > 0 ? 0.96 : 1.04))) }, false);
    clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => onChange(live.current.items, true), 300);
  };
  useEffect(() => () => clearTimeout(wheelTimer.current), []);

  const sel = selectedId ? items.find((i) => i.id === selectedId) : null;
  const selG = sel ? garments.get(sel.garmentId) : null;
  const selGeom = sel && selG ? geom(sel, selG, L) : null;

  return (
    <div
      ref={area} dir="ltr" className="absolute inset-0 select-none" style={{ touchAction: 'none' }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onLostPointerCapture={onUp} onWheel={onWheel}
    >
      {fit.cw > 0 && fit.ch > 0 && (
        <Stage ref={stageRef} width={fit.cw} height={fit.ch} listening={false}>
          <Layer listening={false}>
            {dollImg && <KImage image={dollImg} x={L.ox} y={L.oy} width={L.dw} height={L.dh} />}
            {sorted.map((it) => {
              const g = garments.get(it.garmentId);
              return g ? <ItemNode key={it.id} item={it} garment={g} L={L} /> : null;
            })}
            {sel && selGeom && (
              <Rect
                x={selGeom.cx} y={selGeom.cy} width={selGeom.w} height={selGeom.h}
                offsetX={selGeom.w / 2} offsetY={selGeom.h / 2} rotation={sel.rotation}
                stroke="#b9797c" strokeWidth={1.5} dash={[6, 5]} cornerRadius={6}
              />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
