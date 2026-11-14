import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useBlobUrl } from '../db/blobs';
import type { Doll } from '../db/types';
import { CANONICAL, CANONICAL_SIZE, DEFAULT_CALIBRATION, deriveBody } from '../engine/body';
import { generate } from '../engine/generate';
import { renderMannequin } from '../engine/mannequin';
import { renderGarment } from '../engine/render';
import type { GarmentDesign } from '../engine/types';
import { useFit } from '../ui/useFit';
import { ensureFabricImage } from './renderDesign';

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
  const mannequin = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = mannequin.current;
    if (doll || !c || !fit.scale) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const m = renderMannequin(body, size.w, size.h, fit.scale * dpr);
    c.width = m.width; c.height = m.height;
    c.getContext('2d')!.drawImage(m, 0, 0);
    m.width = 0;
  }, [body, doll, fit.scale, size.w, size.h]);

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
        {doll ? (url && <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full" />) : <canvas ref={mannequin} className="absolute inset-0 h-full w-full" />}
        <canvas
          ref={canvas} className="absolute"
          style={{ left: geo.bbox.x * fit.scale, top: geo.bbox.y * fit.scale, width: geo.bbox.w * fit.scale, height: geo.bbox.h * fit.scale }}
        />
      </div>
    </div>
  );
}
