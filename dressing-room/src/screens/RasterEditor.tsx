import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBlob } from '../db/blobs';
import { saveRasterEdit } from '../db/repo';
import { db } from '../db/schema';
import { fromTemplate, normalizeDesign } from '../engine/templates';
import type { GarmentDesign } from '../engine/types';
import { he } from '../i18n/he';
import { AiGate, aiReady } from '../ai/AiGate';
import { AiError, aiRequest, toJpegDataUrl } from '../ai/client';
import { canvasToBlob, composite, ctx2d, decodeToCanvas, plainBackgroundMask, releaseCanvas, scaledCopy } from '../imaging/load';
import { copyCanvas, fxDetails, fxFabric, fxLength, fxRecolor, fxWarp, trimCanvas } from '../imaging/rasterOps';
import { hexToRgb } from '../imaging/recolor';
import { Chips, Field, Slider, Swatches } from '../studio/controls';
import { DetailsPanel, FabricPanel } from '../studio/panels';
import { ensureFabricImage } from '../studio/renderDesign';
import { errorText } from '../ui/errors';
import { IconBack, IconUndo } from '../ui/icons';
import { toast, toastError } from '../ui/toast';
import { useFit } from '../ui/useFit';

const t = he.edit;
type Tool = keyof typeof t.tools;
const MAX_UNDO = 6, PREVIEW = 720;

export function RasterEditor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const garment = useLiveQuery(() => db.garments.get(id).then((g) => g ?? null), [id]);

  const work = useRef<HTMLCanvasElement | null>(null); // committed image, full resolution
  const small = useRef<HTMLCanvasElement | null>(null); // preview-size copy of `work`
  const view = useRef<HTMLCanvasElement>(null); // what is on screen
  const sel = useRef<HTMLCanvasElement>(null); // region selection (preview size), shown as a tint
  const undo = useRef<HTMLCanvasElement[]>([]);
  const redo = useRef<HTMLCanvasElement[]>([]);
  const area = useRef<HTMLDivElement>(null);

  const [dims, setDims] = useState({ w: 1, h: 1 });
  const fit = useFit(area, dims.w, dims.h);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stack, setStack] = useState({ undo: 0, redo: 0, edits: 0 });
  const [tool, setTool] = useState<Tool>('color');

  // tool parameters
  const [mode, setMode] = useState<'colorize' | 'shift'>('shift');
  const [color, setColor] = useState('#c2253c');
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(0);
  const [strength, setStrength] = useState(100);
  const [region, setRegion] = useState(false);
  const [hasSel, setHasSel] = useState(false);
  const [brush, setBrush] = useState(40);
  const [band, setBand] = useState({ y0: 0.55, y1: 0.8 });
  const [lengthK, setLengthK] = useState(100);
  const [waist, setWaist] = useState(0);
  const [waistY, setWaistY] = useState(40);
  const [hem, setHem] = useState(0);
  const [keep, setKeep] = useState(100);
  const [pseudo, setPseudo] = useState<GarmentDesign>(() => ({ ...fromTemplate('aline'), fabric: { kind: 'floral', colors: ['#27408b', '#ffffff', '#e3c14a'], scale: 1, sheen: 0, sequins: 0 } }));
  const [selDetail, setSelDetail] = useState<string | null>(null);
  const [aiText, setAiText] = useState('');
  const [gate, setGate] = useState(false);

  /** The current tool's effect on any canvas; null when the tool has nothing to preview. */
  const effect = useCallback((src: HTMLCanvasElement, forPreview: boolean): HTMLCanvasElement | null => {
    if (tool === 'color') {
      const active = mode === 'colorize' || hue !== 0 || sat !== 0;
      if (!active || (region && !hasSel)) return null;
      return fxRecolor(src, { mode, color: hexToRgb(color), hue, saturation: sat / 100, strength: strength / 100 }, region ? sel.current : null);
    }
    if (tool === 'length') return lengthK === 100 ? null : fxLength(src, band.y0, band.y1, lengthK / 100);
    if (tool === 'shape') return waist === 0 && hem === 0 ? null : fxWarp(src, waist / 100 * 0.3, waistY / 100, hem / 100 * 0.4);
    if (tool === 'fabric') return fxFabric(src, pseudo.fabric, keep / 100);
    if (tool === 'details') return pseudo.details.length ? fxDetails(src, pseudo) : null;
    void forPreview;
    return null;
  }, [tool, mode, color, hue, sat, strength, region, hasSel, lengthK, band, waist, waistY, hem, keep, pseudo]);

  const show = useCallback((c: HTMLCanvasElement) => {
    const v = view.current;
    if (!v) return;
    if (v.width !== c.width || v.height !== c.height) { v.width = c.width; v.height = c.height; }
    const ctx = ctx2d(v);
    ctx.clearRect(0, 0, v.width, v.height);
    ctx.drawImage(c, 0, 0);
    const w = c.width, h = c.height; // read now: the caller may release `c` before React runs the updater
    setDims((d) => (d.w === w && d.h === h ? d : { w, h }));
  }, []);

  // Live preview: run the effect on the small copy whenever a parameter changes.
  useEffect(() => {
    if (!ready || !small.current) return;
    const id2 = requestAnimationFrame(() => {
      if (!small.current) return;
      try {
        const out = effect(small.current, true);
        show(out ?? small.current);
        if (out) releaseCanvas(out);
      } catch (e) { console.error(e); }
    });
    return () => cancelAnimationFrame(id2);
  }, [effect, ready, show, stack]);

  const resetSel = useCallback(() => {
    const s = sel.current, sm = small.current;
    if (s && sm) { s.width = sm.width; s.height = sm.height; }
    setHasSel(false);
  }, []);

  /** Make `next` the committed image (takes ownership of it). */
  const commit = useCallback((next: HTMLCanvasElement, opts: { keepRedo?: boolean; fromHistory?: boolean } = {}) => {
    if (work.current && !opts.fromHistory) {
      undo.current.push(work.current);
      if (undo.current.length > MAX_UNDO) releaseCanvas(undo.current.shift());
      if (!opts.keepRedo) { redo.current.forEach(releaseCanvas); redo.current = []; }
    }
    work.current = next;
    releaseCanvas(small.current);
    small.current = scaledCopy(next, PREVIEW);
    resetSel();
    setStack((s) => ({ undo: undo.current.length, redo: redo.current.length, edits: s.edits + 1 }));
  }, [resetSel]);

  // Load the garment's current image once.
  const loaded = useRef(false);
  useEffect(() => {
    if (!garment || loaded.current) return;
    loaded.current = true;
    void (async () => {
      try {
        const blob = await getBlob(garment.render);
        if (!blob) throw new Error('missing image');
        commit(await decodeToCanvas(blob, 1536));
        undo.current = [];
        setStack({ undo: 0, redo: 0, edits: 0 });
        setReady(true);
      } catch (e) { toastError(errorText(e, he.errors.loadFailed)); nav(-1); }
    })();
  }, [garment, commit, nav]);
  useEffect(() => () => {
    for (const c of [work.current, small.current, ...undo.current, ...redo.current]) releaseCanvas(c);
    if (view.current) view.current.width = 0;
  }, []);
  useEffect(() => { void ensureFabricImage(pseudo.fabric).then(() => setStack((s) => ({ ...s }))).catch(() => undefined); }, [pseudo.fabric.image]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetParams = () => { setMode('shift'); setHue(0); setSat(0); setStrength(100); setLengthK(100); setWaist(0); setHem(0); setPseudo((p) => ({ ...p, details: [] })); setSelDetail(null); };

  const apply = () => {
    if (!work.current || busy) return;
    setBusy(true);
    setTimeout(() => { // let the "working" state paint before the heavy loop
      try {
        const out = effect(work.current!, false);
        if (out) { commit(trimCanvas(out)); resetParams(); toast(t.applied); }
      } catch (e) { console.error(e); toastError(errorText(e)); }
      finally { setBusy(false); }
    }, 30);
  };
  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev || !work.current) return;
    redo.current.push(work.current);
    commit(prev, { fromHistory: true });
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next || !work.current) return;
    undo.current.push(work.current);
    commit(next, { fromHistory: true });
  };
  const toOriginal = async () => {
    if (!garment || garment.body.kind !== 'raster' || !confirm(t.originalConfirm)) return;
    try {
      const [s, m] = await Promise.all([getBlob(garment.body.source), getBlob(garment.body.mask)]);
      if (!s || !m) throw new Error('missing original');
      const [sc, mc] = await Promise.all([decodeToCanvas(s, 1536), decodeToCanvas(m, 1536)]);
      const full = composite(sc, mc);
      releaseCanvas(sc); releaseCanvas(mc);
      commit(trimCanvas(full));
    } catch (e) { toastError(errorText(e, he.errors.loadFailed)); }
  };
  const save = async (asCopy: boolean) => {
    if (!garment || !work.current) return;
    setBusy(true);
    try {
      const final = trimCanvas(copyCanvas(work.current));
      const thumb = scaledCopy(final, 256);
      const [png, th] = await Promise.all([canvasToBlob(final, 'image/png'), canvasToBlob(thumb, 'image/png')]);
      const r = { png, w: final.width, h: final.height, thumb: th, thumbW: thumb.width, thumbH: thumb.height };
      releaseCanvas(final); releaseCanvas(thumb);
      await saveRasterEdit(garment, r, asCopy);
      toast(asCopy ? t.copySaved : t.saved);
      nav(-1);
    } catch (e) { console.error(e); toastError(errorText(e, he.errors.saveFailed)); setBusy(false); }
  };
  /** Text edit: the garment goes to the AI service, comes back on white, and is cut out again. */
  const aiEdit = async () => {
    if (!work.current || !aiText.trim()) return;
    if (!aiReady()) { setGate(true); return; }
    setBusy(true);
    try {
      const png = await canvasToBlob(work.current, 'image/png');
      const result = await aiRequest({ mode: 'edit', images: [await toJpegDataUrl(png)], text: aiText.trim() });
      const img = await decodeToCanvas(result, 1536);
      const mask = plainBackgroundMask(img, 34);
      const cut = composite(img, mask);
      releaseCanvas(img); releaseCanvas(mask);
      commit(trimCanvas(cut));
      toast(t.applied);
    } catch (e) {
      console.error(e);
      if (e instanceof AiError) { toastError(he.ai[e.code]); if (e.code === 'badPin') setGate(true); }
      else toastError(errorText(e, he.ai.failed));
    } finally { setBusy(false); }
  };

  const leave = () => { if (stack.edits <= 0 || stack.undo === 0 || confirm(t.leaveConfirm)) nav(-1); };

  // ---- pointer: erase brush / region brush ----
  const stroke = useRef<{ id: number; x: number; y: number } | null>(null);
  const painting = ready && !busy && (tool === 'erase' || (tool === 'color' && region));
  const local = (e: RPointerEvent) => {
    const r = view.current!.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height, k: 1 / r.width };
  };
  const paint = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => {
    const target = tool === 'erase' ? work.current : sel.current;
    if (!target) return;
    const ctx = ctx2d(target);
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#b9797c'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = brush * k * target.width;
    ctx.beginPath(); ctx.moveTo(a.x * target.width, a.y * target.height); ctx.lineTo(b.x * target.width + 0.01, b.y * target.height + 0.01); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    if (tool === 'erase' && work.current) {
      const v = view.current!, c = ctx2d(v);
      c.clearRect(0, 0, v.width, v.height);
      c.drawImage(work.current, 0, 0, v.width, v.height);
    }
  };
  const onDown = (e: RPointerEvent) => {
    if (!painting || !e.isPrimary) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === 'erase' && work.current) { // snapshot for undo, then paint straight onto the image
      undo.current.push(copyCanvas(work.current));
      if (undo.current.length > MAX_UNDO) releaseCanvas(undo.current.shift());
      redo.current.forEach(releaseCanvas); redo.current = [];
    }
    const p = local(e);
    stroke.current = { id: e.pointerId, x: p.u, y: p.v };
    paint(stroke.current, stroke.current, p.k);
  };
  const onMove = (e: RPointerEvent) => {
    const s = stroke.current;
    if (!s || s.id !== e.pointerId) return;
    const p = local(e);
    paint(s, { x: p.u, y: p.v }, p.k);
    stroke.current = { id: s.id, x: p.u, y: p.v };
  };
  const onUp = (e: RPointerEvent) => {
    if (stroke.current?.id !== e.pointerId) return;
    stroke.current = null;
    if (tool === 'erase' && work.current) {
      releaseCanvas(small.current);
      small.current = scaledCopy(work.current, PREVIEW);
      setStack((s) => ({ undo: undo.current.length, redo: 0, edits: s.edits + 1 }));
    } else setHasSel(true);
  };

  // ---- length guides ----
  const guide = useRef<{ id: number; key: 'y0' | 'y1' } | null>(null);
  const guideMove = (e: RPointerEvent) => {
    const g = guide.current, r = view.current?.getBoundingClientRect();
    if (!g || g.id !== e.pointerId || !r?.height) return;
    const y = Math.min(0.98, Math.max(0.02, (e.clientY - r.top) / r.height));
    setBand((b) => ({ ...b, [g.key]: y }));
  };

  if (garment === null) return <div className="p-8 text-center text-muted">{he.garment.notFound}</div>;
  const canApply = tool !== 'erase' && tool !== 'ai' && ready && !busy;
  const setPseudoN = (d: GarmentDesign) => setPseudo(normalizeDesign(d));

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col bg-cream">
      <header className="safe-t flex items-center gap-1 px-2 py-1">
        <button className="flex h-12 w-12 items-center justify-center" onClick={leave} aria-label={he.common.back}><IconBack /></button>
        <h1 className="min-w-0 flex-1 truncate font-serif text-lg">{t.title}</h1>
        <button className="flex h-12 w-11 items-center justify-center disabled:opacity-30" onClick={doUndo} disabled={!stack.undo || busy} aria-label={he.studio.undo}><IconUndo /></button>
        <button className="flex h-12 w-11 -scale-x-100 items-center justify-center disabled:opacity-30" onClick={doRedo} disabled={!stack.redo || busy} aria-label={he.studio.redo}><IconUndo /></button>
        <button className="btn btn-primary !min-h-10 !px-4 text-sm" disabled={!ready || busy} onClick={() => void save(false)}>{he.common.save}</button>
      </header>

      <div ref={area} className="checker relative flex min-h-0 flex-[5] items-center justify-center overflow-hidden p-3">
        <div
          dir="ltr" className="relative" style={{ width: fit.width, height: fit.height, touchAction: painting ? 'none' : 'auto' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}
        >
          <canvas ref={view} className="absolute inset-0 h-full w-full" />
          <canvas ref={sel} className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: tool === 'color' && region ? 0.55 : 0 }} />
          {tool === 'length' && (['y0', 'y1'] as const).map((key) => (
            <div
              key={key} className="absolute inset-x-0 flex h-11 -translate-y-1/2 items-center" style={{ top: `${band[key] * 100}%`, touchAction: 'none' }}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); guide.current = { id: e.pointerId, key }; }}
              onPointerMove={guideMove} onPointerUp={() => { guide.current = null; }} onPointerCancel={() => { guide.current = null; }}
            >
              <span className="h-0.5 flex-1 bg-rose" /><span className="h-6 w-6 rounded-full border-2 border-white bg-rose shadow" /><span className="h-0.5 w-3 bg-rose" />
            </div>
          ))}
        </div>
        {(!ready || busy) && (
          <div className="absolute inset-0 flex items-center justify-center bg-cream/70" role="status">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-rose-soft border-t-rose" />
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto border-y border-line bg-paper px-3 py-2" role="tablist">
        {(Object.keys(t.tools) as Tool[]).map((k) => (
          <button key={k} role="tab" aria-selected={tool === k} className="chip" aria-pressed={tool === k} onClick={() => setTool(k)}>{t.tools[k]}</button>
        ))}
      </div>

      <div className="safe-b min-h-0 flex-[4] space-y-3 overflow-y-auto p-4">
        {tool === 'color' && (
          <>
            <Chips options={[['colorize', t.colorize], ['shift', t.hueShift]] as const} value={mode} onChange={setMode} />
            {mode === 'colorize'
              ? <Swatches label={he.studio.color} value={color} onChange={setColor} />
              : <Slider label={t.hue} min={-180} max={180} value={hue} onChange={setHue} />}
            <Slider label={t.saturation} min={-100} max={100} value={sat} onChange={setSat} />
            <Slider label={t.strength} value={strength} onChange={setStrength} />
            <Field label="">
              <Chips options={[['whole', t.whole], ['region', t.region]] as const} value={region ? 'region' : 'whole'} onChange={(v) => setRegion(v === 'region')} />
            </Field>
            {region && (
              <>
                <p className="text-xs text-muted">{t.regionHint}</p>
                <Slider label={t.brush} min={10} max={100} value={brush} onChange={setBrush} />
                <button className="min-h-11 text-sm text-rose-deep underline" onClick={resetSel}>{t.clearRegion}</button>
              </>
            )}
          </>
        )}
        {tool === 'length' && (
          <>
            <p className="text-xs text-muted">{t.lengthHint}</p>
            <label className="block">
              <span className="mb-0.5 block text-xs text-muted">{t.lengthAmount}</span>
              <input type="range" dir="ltr" min={0} max={160} value={lengthK} className="h-11 w-full" onChange={(e) => setLengthK(Number(e.target.value))} />
            </label>
          </>
        )}
        {tool === 'erase' && (
          <>
            <p className="text-xs text-muted">{t.eraseHint}</p>
            <Slider label={t.brush} min={10} max={100} value={brush} onChange={setBrush} />
          </>
        )}
        {tool === 'shape' && (
          <>
            <Slider label={t.waistTaper} min={-50} max={50} value={waist} onChange={setWaist} />
            <Slider label={t.waistPos} min={15} max={75} value={waistY} onChange={setWaistY} />
            <Slider label={t.hemWiden} min={-50} max={100} value={hem} onChange={setHem} />
          </>
        )}
        {tool === 'fabric' && (
          <>
            <FabricPanel d={pseudo} set={setPseudoN} />
            <Slider label={t.keepShading} value={keep} onChange={setKeep} />
          </>
        )}
        {tool === 'details' && <DetailsPanel d={pseudo} set={setPseudoN} selected={selDetail} onSelect={setSelDetail} noDrag />}

        {tool === 'ai' && (
          <>
            <p className="text-xs text-muted">{he.ai.editHint}</p>
            <textarea
              value={aiText} maxLength={300} rows={3} placeholder={he.ai.editPlaceholder} onChange={(e) => setAiText(e.target.value)}
              className="w-full rounded-2xl border border-line bg-paper p-3 outline-none focus:border-rose"
            />
            <button className="btn btn-primary w-full" disabled={!ready || busy || !aiText.trim()} onClick={() => void aiEdit()}>
              {busy ? t.working : he.ai.editGo}
            </button>
          </>
        )}
        {tool !== 'erase' && tool !== 'ai' && <button className="btn btn-primary w-full" disabled={!canApply} onClick={apply}>{busy ? t.working : t.apply}</button>}
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1 text-sm" disabled={!ready || busy} onClick={() => void save(true)}>{he.studio.saveCopy}</button>
          <button className="btn btn-ghost flex-1 text-sm" disabled={!ready || busy} onClick={() => void toOriginal()}>{t.original}</button>
        </div>
      </div>
      {gate && <AiGate onClose={() => setGate(false)} onReady={() => { setGate(false); void aiEdit(); }} />}
    </div>
  );
}
