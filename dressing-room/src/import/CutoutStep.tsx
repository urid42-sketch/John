import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { he } from '../i18n/he';
import { autoMask, consumeCrashFlag, isModelReady, type BgProgress } from '../imaging/bgRemoval';
import { composite, ctx2d, fullMask, makeCanvas, plainBackgroundMask, releaseCanvas } from '../imaging/load';
import { IconBrush, IconEraser, IconSparkle, IconUndo } from '../ui/icons';
import { toastError } from '../ui/toast';
import { useFit } from '../ui/useFit';

type Tool = 'erase' | 'restore';
type View = { s: number; tx: number; ty: number };
const MAX_UNDO = 6;

/**
 * Background removal + manual touch-up. `source` is never modified; the result is a mask canvas
 * (alpha = keep). One finger paints, two fingers zoom and pan.
 */
export function CutoutStep({ source, initialMask, onDone }: {
  source: HTMLCanvasElement;
  /** null ⇒ run the automatic removal on mount */
  initialMask: HTMLCanvasElement | null;
  onDone: (mask: HTMLCanvasElement) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const ghost = useRef<HTMLCanvasElement>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const undo = useRef<Uint8Array[]>([]);
  const fit = useFit(area, source.width, source.height);

  const [tool, setTool] = useState<Tool>('erase');
  const [brush, setBrush] = useState(36); // screen px diameter
  const [busy, setBusy] = useState<BgProgress | 'plain' | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [ask, setAsk] = useState(false);
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const raf = useRef(0);
  const redraw = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (display.current && mask.current) composite(source, mask.current, display.current);
    });
  }, [source]);

  const snapshot = useCallback(() => {
    const m = mask.current;
    if (!m) return;
    const d = ctx2d(m, true).getImageData(0, 0, m.width, m.height).data;
    const a = new Uint8Array(m.width * m.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    undo.current.push(a);
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setUndoCount(undo.current.length);
  }, []);

  const doUndo = useCallback(() => {
    const m = mask.current, a = undo.current.pop();
    if (!m || !a) return;
    const img = new ImageData(m.width, m.height);
    for (let i = 0; i < a.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = a[i]; }
    ctx2d(m, true).putImageData(img, 0, 0);
    setUndoCount(undo.current.length);
    redraw();
  }, [redraw]);

  const replaceMask = useCallback((next: HTMLCanvasElement, keepUndo = true) => {
    if (keepUndo && mask.current) snapshot();
    const m = mask.current ?? makeCanvas(source.width, source.height);
    const ctx = ctx2d(m, true);
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(next, 0, 0, m.width, m.height);
    ctx.globalCompositeOperation = 'source-over';
    mask.current = m;
    if (next !== m) releaseCanvas(next);
    redraw();
  }, [redraw, snapshot, source]);

  const alive = useRef(true);
  const handedOff = useRef(false);
  const runAuto = useCallback(async () => {
    setAsk(false);
    setBusy({ phase: 'compute', ratio: 0 });
    try {
      const m = await autoMask(source, (p) => { if (alive.current) setBusy(p); });
      if (alive.current) replaceMask(m); else releaseCanvas(m);
    } catch (e) {
      console.error(e);
      if (alive.current) toastError(he.errors.bgFailed);
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [replaceMask, source]);

  const runPlain = useCallback(() => {
    setAsk(false);
    setBusy('plain');
    // Let the spinner paint before the synchronous flood fill.
    setTimeout(() => {
      if (!alive.current) return;
      try { replaceMask(plainBackgroundMask(source)); }
      catch (e) { console.error(e); toastError(he.errors.generic); }
      finally { setBusy(null); }
    }, 30);
  }, [replaceMask, source]);

  // Init canvases once per source.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (display.current) { display.current.width = source.width; display.current.height = source.height; }
    if (ghost.current) {
      // The ghost is only a faint guide, so a reduced copy is enough.
      const k = Math.min(1, 1000 / Math.max(source.width, source.height));
      ghost.current.width = Math.round(source.width * k);
      ghost.current.height = Math.round(source.height * k);
      ctx2d(ghost.current).drawImage(source, 0, 0, ghost.current.width, ghost.current.height);
    }
    replaceMask(initialMask ?? fullMask(source.width, source.height), false);
    if (initialMask) return;
    if (consumeCrashFlag()) toastError(he.import.crashed);
    else if (isModelReady()) void runAuto();
    else setAsk(true); // first time: ask before an 80MB download
  }, [initialMask, replaceMask, runAuto, source]);
  useEffect(() => {
    alive.current = true;
    const d = display.current, g = ghost.current;
    return () => {
      alive.current = false;
      if (raf.current) cancelAnimationFrame(raf.current);
      releaseCanvas(d); releaseCanvas(g);
      if (!handedOff.current) releaseCanvas(mask.current);
      undo.current = [];
    };
  }, []);

  // ---- pointer handling: one finger paints, two fingers zoom / pan ----
  const pts = useRef(new Map<number, { x: number; y: number }>());
  /** `armed` = finger is down but nothing has been painted (or snapshotted) yet. */
  const stroke = useRef<{ id: number; x: number; y: number; armed: boolean } | null>(null);
  const pinch = useRef<{ ids: [number, number]; d: number; cx: number; cy: number; view: View } | null>(null);

  const toImage = (cx: number, cy: number) => {
    const r = display.current!.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * source.width, y: ((cy - r.top) / r.height) * source.height, k: source.width / r.width };
  };
  const paint = (from: { x: number; y: number }, to: { x: number; y: number }, k: number) => {
    const m = mask.current;
    if (!m) return;
    const ctx = ctx2d(m, true);
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush * k;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y + 0.01);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    redraw();
  };
  const clampView = (v: View): View => {
    const s = Math.min(6, Math.max(1, v.s));
    return {
      s,
      tx: Math.min(0, Math.max(fit.width * (1 - s), v.tx)),
      ty: Math.min(0, Math.max(fit.height * (1 - s), v.ty)),
    };
  };
  const pinchState = (ids: [number, number]) => {
    const a = pts.current.get(ids[0])!, b = pts.current.get(ids[1])!;
    const base = area.current!.getBoundingClientRect();
    const ox = base.left + (base.width - fit.width) / 2, oy = base.top + (base.height - fit.height) / 2;
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2 - ox, cy: (a.y + b.y) / 2 - oy };
  };

  const onDown = (e: RPointerEvent) => {
    if (busy || ask) return;
    // A new primary pointer means no other finger is down: drop anything a missed "up" left behind.
    if (e.isPrimary) { pts.current.clear(); stroke.current = null; pinch.current = null; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) {
      const p = toImage(e.clientX, e.clientY);
      stroke.current = { id: e.pointerId, x: p.x, y: p.y, armed: true };
    } else if (pts.current.size === 2) {
      // Second finger means "zoom". Nothing was painted yet if the first finger hasn't moved.
      const s = stroke.current;
      stroke.current = null;
      if (s && !s.armed) doUndo();
      const ids = [...pts.current.keys()] as [number, number];
      pinch.current = { ids, ...pinchState(ids), view: viewRef.current };
    }
  };
  const onMove = (e: RPointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p0 = pinch.current, st = stroke.current;
    if (p0) {
      if (!p0.ids.includes(e.pointerId)) return;
      const p1 = pinchState(p0.ids);
      const s = Math.min(6, Math.max(1, p0.view.s * (p1.d / p0.d)));
      const r = s / p0.view.s;
      setView(clampView({ s, tx: p1.cx - (p0.cx - p0.view.tx) * r, ty: p1.cy - (p0.cy - p0.view.ty) * r }));
    } else if (st && st.id === e.pointerId) {
      const p = toImage(e.clientX, e.clientY);
      if (st.armed) {
        if (Math.hypot(p.x - st.x, p.y - st.y) / p.k < 3) return;
        snapshot();
      }
      paint(st, p, p.k);
      stroke.current = { id: st.id, x: p.x, y: p.y, armed: false };
    }
  };
  const onUp = (e: RPointerEvent) => {
    if (!pts.current.delete(e.pointerId)) return;
    const st = stroke.current;
    if (st && st.id === e.pointerId) {
      if (st.armed && e.type === 'pointerup') { // a tap paints a single dot
        const k = toImage(e.clientX, e.clientY).k;
        snapshot();
        paint(st, st, k);
      }
      stroke.current = null;
    }
    if (pinch.current?.ids.includes(e.pointerId)) pinch.current = null;
  };

  const progress = busy && busy !== 'plain' ? busy : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={area} className="checker relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          dir="ltr" className="relative overflow-hidden"
          style={{ width: fit.width, height: fit.height, touchAction: 'none' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}
        >
          <div
            className="absolute inset-0 origin-top-left"
            style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}
          >
            <canvas ref={ghost} className="absolute inset-0 h-full w-full" style={{ opacity: tool === 'restore' ? 0.35 : 0.12 }} />
            <canvas ref={display} className="absolute inset-0 h-full w-full" />
          </div>
        </div>
        {ask && !busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-cream/95 p-8 text-center" role="dialog" aria-label={he.import.consentTitle}>
            <h2 className="font-serif text-xl">{he.import.consentTitle}</h2>
            <p className="max-w-xs text-sm leading-relaxed text-muted">{he.import.consentBody}</p>
            <button className="btn btn-primary w-full max-w-xs" onClick={() => void runAuto()}>{he.import.consentGo}</button>
            <button className="btn btn-ghost w-full max-w-xs" onClick={() => setAsk(false)}>{he.import.consentSkip}</button>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-cream/85 p-8 text-center" role="status">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-rose-soft border-t-rose" />
            <p className="font-medium">{he.import.removing}</p>
            {progress?.phase === 'download' && progress.ratio < 1 && (
              <>
                <p className="max-w-xs text-sm text-muted">{he.import.firstRun}</p>
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-rose-soft" dir="ltr">
                  <div className="h-full bg-rose" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="safe-b space-y-3 border-t border-line bg-paper p-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-full border border-line p-1" role="group">
            {(['erase', 'restore'] as const).map((t) => (
              <button
                key={t} aria-pressed={tool === t} onClick={() => setTool(t)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm ${
                  tool === t ? 'bg-rose text-white' : 'text-ink'
                }`}
              >
                {t === 'erase' ? <IconEraser /> : <IconBrush />}
                {he.import[t]}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost !px-3" onClick={doUndo} disabled={!undoCount || !!busy} aria-label={he.common.undo}>
            <IconUndo />
          </button>
        </div>
        <label className="flex items-center gap-3 text-sm text-muted">
          <span className="shrink-0">{he.import.brush}</span>
          <input
            type="range" min={10} max={90} value={brush} className="h-11 flex-1"
            onChange={(e) => setBrush(Number(e.target.value))}
          />
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <span className="rounded-full bg-rose/60" style={{ width: brush / 2, height: brush / 2 }} />
          </span>
        </label>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1 !px-2 text-sm" onClick={() => void runAuto()} disabled={!!busy}>
            <IconSparkle />{he.import.auto}
          </button>
          <button className="btn btn-ghost flex-1 !px-2 text-sm" onClick={runPlain} disabled={!!busy}>
            {he.import.plainBg}
          </button>
          <button
            className="btn btn-ghost flex-1 !px-2 text-sm" disabled={!!busy}
            onClick={() => replaceMask(fullMask(source.width, source.height))}
          >
            {he.import.resetMask}
          </button>
        </div>
        <button className="btn btn-primary w-full" disabled={!!busy || ask} onClick={() => { if (mask.current) { handedOff.current = true; onDone(mask.current); } }}>
          {he.common.next}
        </button>
        <p className="text-center text-xs text-muted">{he.import.zoomHint}</p>
      </div>
    </div>
  );
}
