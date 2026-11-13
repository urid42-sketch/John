import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { he } from '../i18n/he';
import { cropCanvas, ctx2d } from '../imaging/load';
import { useFit } from '../ui/useFit';

type Box = { x0: number; y0: number; x1: number; y1: number }; // normalized 0..1
type Handle = 'tl' | 'tr' | 'bl' | 'br' | 'move';
const MIN = 0.08;

export function CropStep({ source, hint, onDone }: {
  source: HTMLCanvasElement; hint: string; onDone: (cropped: HTMLCanvasElement, changed: boolean) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const fit = useFit(area, source.width, source.height);
  const [box, setBox] = useState<Box>({ x0: 0, y0: 0, x1: 1, y1: 1 });
  const drag = useRef<{ h: Handle; px: number; py: number; start: Box } | null>(null);

  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const s = Math.min(1, 1200 / Math.max(source.width, source.height));
    c.width = Math.round(source.width * s);
    c.height = Math.round(source.height * s);
    ctx2d(c).drawImage(source, 0, 0, c.width, c.height);
  }, [source]);

  const down = (h: Handle) => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { h, px: e.clientX, py: e.clientY, start: box };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !fit.width) return;
    const dx = (e.clientX - d.px) / fit.width, dy = (e.clientY - d.py) / fit.height;
    const b = { ...d.start };
    const cl = (v: number) => Math.min(1, Math.max(0, v));
    if (d.h === 'move') {
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      b.x0 = Math.min(1 - w, Math.max(0, b.x0 + dx)); b.x1 = b.x0 + w;
      b.y0 = Math.min(1 - h, Math.max(0, b.y0 + dy)); b.y1 = b.y0 + h;
    } else {
      if (d.h[1] === 'l') b.x0 = Math.min(cl(b.x0 + dx), b.x1 - MIN); else b.x1 = Math.max(cl(b.x1 + dx), b.x0 + MIN);
      if (d.h[0] === 't') b.y0 = Math.min(cl(b.y0 + dy), b.y1 - MIN); else b.y1 = Math.max(cl(b.y1 + dy), b.y0 + MIN);
    }
    setBox(b);
  };
  const up = () => { drag.current = null; };

  const finish = () => {
    const changed = box.x0 > 0.005 || box.y0 > 0.005 || box.x1 < 0.995 || box.y1 < 0.995;
    if (!changed) return onDone(source, false);
    onDone(cropCanvas(source, {
      x: box.x0 * source.width, y: box.y0 * source.height,
      w: (box.x1 - box.x0) * source.width, h: (box.y1 - box.y0) * source.height,
    }), true);
  };

  const pct = (v: number) => `${v * 100}%`;
  const corner = (h: Exclude<Handle, 'move'>) => (
    <div
      key={h}
      onPointerDown={down(h)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      className="absolute flex h-12 w-12 items-center justify-center"
      style={{
        left: pct(h[1] === 'l' ? box.x0 : box.x1), top: pct(h[0] === 't' ? box.y0 : box.y1),
        transform: 'translate(-50%, -50%)', touchAction: 'none',
      }}
    >
      <span className="h-5 w-5 rounded-full border-2 border-white bg-rose shadow" />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-4 pb-2 text-center text-sm text-muted">{hint}</p>
      <div ref={area} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-4">
        <div dir="ltr" className="relative select-none" style={{ width: fit.width, height: fit.height }}>
          <canvas ref={view} className="block h-full w-full rounded-sm" />
          <div
            onPointerDown={down('move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            className="absolute border-2 border-white"
            style={{
              left: pct(box.x0), top: pct(box.y0), width: pct(box.x1 - box.x0), height: pct(box.y1 - box.y0),
              boxShadow: '0 0 0 9999px rgba(59,48,44,0.55)', touchAction: 'none',
            }}
          />
          {(['tl', 'tr', 'bl', 'br'] as const).map(corner)}
        </div>
      </div>
      <div className="safe-b p-4">
        <button className="btn btn-primary w-full" onClick={finish}>{he.common.next}</button>
      </div>
    </div>
  );
}
