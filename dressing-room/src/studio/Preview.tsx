import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useBlobUrl } from '../db/blobs';
import type { Doll } from '../db/types';
import { CANONICAL, CANONICAL_SIZE, DEFAULT_CALIBRATION, deriveBody } from '../engine/body';
import { generate } from '../engine/generate';
import { renderGarment } from '../engine/render';
import type { Body, GarmentDesign } from '../engine/types';
import { useFit } from '../ui/useFit';
import { ensureFabricImage } from './renderDesign';

/** Neutral mannequin for when there is no doll photo yet. */
function Croquis({ b }: { b: Body }) {
  const headR = (b.neck.r - b.neck.l) * 0.95, cx = (b.neck.l + b.neck.r) / 2;
  const d = `M${b.neck.l} ${b.neck.y} L${b.shoulder.l} ${b.shoulder.y} L${b.underarm.l} ${b.underarm.y} L${b.waist.l} ${b.waist.y} L${b.hip.l} ${b.hip.y}
    L${b.knee.l} ${b.knee.y} L${b.ankle.l} ${b.ankle.y} L${b.ankle.l} ${b.floorY} L${b.innerAnkle.l} ${b.floorY} L${b.innerKnee.l} ${b.knee.y} L${b.cx} ${b.crotchY}
    L${b.innerKnee.r} ${b.knee.y} L${b.innerAnkle.r} ${b.floorY} L${b.ankle.r} ${b.floorY} L${b.ankle.r} ${b.ankle.y} L${b.knee.r} ${b.knee.y}
    L${b.hip.r} ${b.hip.y} L${b.waist.r} ${b.waist.y} L${b.underarm.r} ${b.underarm.y} L${b.shoulder.r} ${b.shoulder.y} L${b.neck.r} ${b.neck.y} Z`;
  const arm = (s: { x: number; y: number }, w: { x: number; y: number }) => <line x1={s.x} y1={s.y + 12} x2={w.x} y2={w.y} strokeWidth={(b.shoulder.r - b.shoulder.l) * 0.17} strokeLinecap="round" />;
  return (
    <svg viewBox={`0 0 ${CANONICAL_SIZE.w} ${CANONICAL_SIZE.h}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
      <g fill="#e7d3c4" stroke="#e7d3c4" strokeLinejoin="round">
        {arm({ x: b.shoulder.l + 6, y: b.shoulder.y }, b.wristL)}
        {arm({ x: b.shoulder.r - 6, y: b.shoulder.y }, b.wristR)}
        <path d={d} strokeWidth={10} />
        <ellipse cx={cx} cy={b.neck.y - headR * 1.25} rx={headR} ry={headR * 1.25} />
      </g>
    </svg>
  );
}

/**
 * Live preview: the design is generated for this doll's own body, so it follows her proportions.
 * With a "free" detail selected, dragging on the preview moves it.
 */
export function Preview({ design, doll, dragDetail, onDragDetail }: {
  design: GarmentDesign; doll: Doll | null; dragDetail: boolean; onDragDetail: (x: number, y: number) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = doll ? { w: doll.w, h: doll.h } : CANONICAL_SIZE;
  const fit = useFit(area, size.w, size.h);
  const url = useBlobUrl(doll?.cutout);
  const body = useMemo(
    () => (doll ? deriveBody(doll.calibration ?? DEFAULT_CALIBRATION, doll.w, doll.h) : CANONICAL),
    [doll],
  );
  const geo = useMemo(() => generate(design, body), [design, body]);
  const [imagesReady, setImagesReady] = useState(0);

  useEffect(() => {
    let alive = true;
    ensureFabricImage(design.fabric).then(() => { if (alive) setImagesReady((n) => n + 1); }).catch(() => undefined);
    return () => { alive = false; };
  }, [design.fabric.image, design.fabric.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvas.current;
    if (!c || !fit.scale) return;
    const id = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderGarment(geo, design, fit.scale * dpr, c);
    });
    return () => cancelAnimationFrame(id);
  }, [geo, design, fit.scale, imagesReady]);
  useEffect(() => { const c = canvas.current; return () => { if (c) { c.width = 0; c.height = 0; } }; }, []);

  const dragging = useRef<number | null>(null);
  const move = (e: RPointerEvent) => {
    const r = canvas.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    onDragDetail(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };

  return (
    <div ref={area} className="absolute inset-0 flex items-center justify-center">
      <div
        dir="ltr" className="relative" style={{ width: fit.width, height: fit.height, touchAction: dragDetail ? 'none' : 'auto' }}
        onPointerDown={(e) => { if (!dragDetail) return; dragging.current = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (dragging.current === e.pointerId) move(e); }}
        onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}
      >
        {doll ? (url && <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full" />) : <Croquis b={body} />}
        <canvas
          ref={canvas} className="absolute"
          style={{ left: geo.bbox.x * fit.scale, top: geo.bbox.y * fit.scale, width: geo.bbox.w * fit.scale, height: geo.bbox.h * fit.scale }}
        />
      </div>
    </div>
  );
}
