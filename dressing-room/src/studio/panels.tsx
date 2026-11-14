import { useRef } from 'react';
import { allowedSleeves, hasNeckline, hasProfile, hasSlit, HEM_STOPS } from '../engine/templates';
import type { Detail, DetailKind, FabricKind, GarmentDesign, Neckline, Profile, Sleeves } from '../engine/types';
import { he } from '../i18n/he';
import { errorText } from '../ui/errors';
import { IconImage, IconTrash } from '../ui/icons';
import { toastError } from '../ui/toast';
import { Chips, Field, Slider, Swatches } from './controls';
import { addFabricImage } from './renderDesign';

type Set = (d: GarmentDesign, key?: string) => void;
const t = he.studio;
const entries = <K extends string>(o: Record<K, string>) => Object.entries(o) as [K, string][];

export function CutPanel({ d, set }: { d: GarmentDesign; set: Set }) {
  const up = (patch: Partial<GarmentDesign>, key?: string) => set({ ...d, ...patch }, key);
  const lengthLabels = d.type === 'top' ? t.lengthsTop : d.type === 'pants' ? t.lengthsPants : t.lengths;
  const stop = (Object.entries(HEM_STOPS) as [keyof typeof HEM_STOPS, number][]).find(([, v]) => Math.abs(v - d.hem) < 0.02)?.[0] ?? null;
  const sleeves = allowedSleeves(d.type, d.neckline);
  return (
    <div className="space-y-4">
      <Field label={t.length}>
        <Chips options={entries(lengthLabels)} value={stop} onChange={(k) => up({ hem: HEM_STOPS[k] })} />
        <Slider label="" value={d.hem * 100} onChange={(v) => up({ hem: v / 100 }, 'hem')} />
      </Field>
      {hasNeckline(d.type) && (
        <>
          <Field label={t.neckline}>
            <Chips options={entries(t.necklines)} value={d.neckline} onChange={(neckline: Neckline) => up({ neckline })} />
          </Field>
          <Slider label={t.neckDepth} value={d.neckDepth * 100} onChange={(v) => up({ neckDepth: v / 100 }, 'neckDepth')} />
          <Field label={t.sleeves}>
            <Chips
              options={entries(t.sleeveKinds)} value={d.sleeves} onChange={(s: Sleeves) => up({ sleeves: s })}
              disabled={(Object.keys(t.sleeveKinds) as Sleeves[]).filter((s) => !sleeves.includes(s))}
            />
          </Field>
          <Slider label={t.waist} start={t.waistLoose} end={t.waistFitted} value={d.waistFit * 100} onChange={(v) => up({ waistFit: v / 100 }, 'waistFit')} />
        </>
      )}
      {hasProfile(d.type) && (
        <Field label={t.profile}>
          <Chips options={entries(t.profiles)} value={d.profile} onChange={(profile: Profile) => up({ profile, flare: profile === 'fitted' ? 0 : Math.max(d.flare, 0.3) })} />
        </Field>
      )}
      <Slider label={t.width} value={(d.ease / 0.3) * 100} onChange={(v) => up({ ease: (v / 100) * 0.3 }, 'ease')} />
      {(d.type === 'pants' || d.profile !== 'fitted') && (
        <Slider label={t.flare} value={d.flare * 100} onChange={(v) => up({ flare: v / 100 }, 'flare')} />
      )}
      {hasSlit(d) && (
        <Field label={t.slit}>
          <Chips
            options={[['none', t.slitNone], ...entries(t.slitSides)] as const}
            value={d.slit?.side ?? 'none'}
            onChange={(side) => up({ slit: side === 'none' ? null : { side, height: d.slit?.height ?? 0.55 } })}
          />
          {d.slit && (
            <Slider label={t.slitHeight} min={10} max={90} value={d.slit.height * 100}
              onChange={(v) => up({ slit: { ...d.slit!, height: v / 100 } }, 'slit')} />
          )}
        </Field>
      )}
    </div>
  );
}

export function FabricPanel({ d, set }: { d: GarmentDesign; set: Set }) {
  const f = d.fabric;
  const fileRef = useRef<HTMLInputElement>(null);
  const up = (patch: Partial<GarmentDesign['fabric']>, key?: string) => set({ ...d, fabric: { ...f, ...patch } }, key);
  const color = (i: number) => (c: string) => { const colors = [...f.colors]; colors[i] = c; up({ colors }, `color${i}`); };
  const pick = (kind: FabricKind) => {
    if (kind === 'image' && !f.image) { fileRef.current?.click(); return; }
    up({ kind, sheen: kind === 'satin' ? Math.max(f.sheen, 0.5) : kind === 'solid' ? f.sheen : Math.min(f.sheen, 0.15) });
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try { up({ kind: 'image', image: await addFabricImage(file) }); }
    catch (e) { toastError(errorText(e, he.errors.decode)); }
  };
  const multi = f.kind === 'floral' || f.kind === 'plaid';
  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; void upload(x); }} />
      <Field label={t.fabricKind}>
        <Chips options={entries(t.fabrics)} value={f.kind} onChange={pick} />
      </Field>
      {f.kind === 'image' ? (
        <button className="btn btn-ghost w-full" onClick={() => fileRef.current?.click()}><IconImage />{t.uploadFabric}</button>
      ) : (
        <Swatches label={t.color} value={f.colors[0]} onChange={color(0)} />
      )}
      {multi && <Swatches label={t.color2} value={f.colors[1] ?? '#ffffff'} onChange={color(1)} />}
      {multi && <Swatches label={t.color3} value={f.colors[2] ?? '#3b302c'} onChange={color(2)} />}
      {f.kind !== 'solid' && f.kind !== 'satin' && (
        <Slider label={t.patternScale} min={30} max={300} value={f.scale * 100} onChange={(v) => up({ scale: v / 100 }, 'scale')} />
      )}
      <Slider label={t.sheen} value={f.sheen * 100} onChange={(v) => up({ sheen: v / 100 }, 'sheen')} />
      <Slider label={t.sequins} value={f.sequins * 100} onChange={(v) => up({ sequins: v / 100 }, 'sequins')} />
    </div>
  );
}

const DETAIL_DEFAULTS: Record<DetailKind, Omit<Detail, 'id' | 'kind' | 'color'>> = {
  belt: { x: 0.5, y: 0.5, size: 1 },
  buttons: { x: 0.5, y: 0.06, size: 1, n: 5, len: 0.5 },
  zipper: { x: 0.5, y: 0.02, size: 1, len: 0.6 },
  ruffle: { x: 0.5, y: 0.5, size: 1, host: 'hem' },
  bow: { x: 0.5, y: 0.3, size: 1 },
  embroidery: { x: 0.62, y: 0.25, size: 1, n: 0 },
  sequins: { x: 0.5, y: 0.25, size: 1 },
};
export const FREE_KINDS: DetailKind[] = ['bow', 'embroidery', 'sequins'];

export function DetailsPanel({ d, set, selected, onSelect, noDrag }: {
  d: GarmentDesign; set: Set; selected: string | null; onSelect: (id: string | null) => void; noDrag?: boolean;
}) {
  const sel = d.details.find((x) => x.id === selected) ?? null;
  const add = (kind: DetailKind) => {
    const dark = kind === 'belt' || kind === 'buttons' || kind === 'zipper';
    const det: Detail = { id: crypto.randomUUID(), kind, color: dark ? '#3b302c' : kind === 'ruffle' ? d.fabric.colors[0] : '#f4ece4', ...DETAIL_DEFAULTS[kind] };
    set({ ...d, details: [...d.details, det] });
    onSelect(det.id);
  };
  const patch = (p: Partial<Detail>, key: string) => {
    if (sel) set({ ...d, details: d.details.map((x) => (x.id === sel.id ? { ...x, ...p } : x)) }, `${sel.id}:${key}`);
  };
  const remove = () => {
    if (!sel) return;
    set({ ...d, details: d.details.filter((x) => x.id !== sel.id) });
    onSelect(null);
  };
  return (
    <div className="space-y-4">
      <Field label={t.addDetail}>
        <Chips options={entries(t.details)} value={null} onChange={add} />
      </Field>
      {d.details.length === 0 && <p className="text-sm text-muted">{t.noDetails}</p>}
      {d.details.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {d.details.map((x, i) => (
            <button key={x.id} className="chip" aria-pressed={x.id === selected} onClick={() => onSelect(x.id === selected ? null : x.id)}>
              <span className="me-2 inline-block h-3 w-3 rounded-full border border-line" style={{ background: x.color }} />
              {t.details[x.kind]} {d.details.filter((y, j) => y.kind === x.kind && j <= i).length > 1 ? d.details.filter((y, j) => y.kind === x.kind && j <= i).length : ''}
            </button>
          ))}
        </div>
      )}
      {sel && (
        <div className="space-y-3 rounded-3xl border border-line bg-paper p-4">
          <Swatches label={t.color} value={sel.color} onChange={(color) => patch({ color }, 'color')} />
          <Slider label={t.detailSize} min={30} max={300} value={sel.size * 100} onChange={(v) => patch({ size: v / 100 }, 'size')} />
          {sel.kind !== 'ruffle' && (
            <Slider label={t.detailY} value={sel.y * 100} onChange={(v) => patch({ y: v / 100 }, 'y')} />
          )}
          {sel.kind !== 'ruffle' && (
            <label className="block">
              <span className="mb-0.5 block text-xs text-muted">{t.detailX}</span>
              <input type="range" dir="ltr" min={0} max={100} value={Math.round(sel.x * 100)} className="h-11 w-full"
                onChange={(e) => patch({ x: Number(e.target.value) / 100 }, 'x')} />
            </label>
          )}
          {sel.kind === 'buttons' && <Slider label={t.detailCount} min={1} max={12} value={sel.n ?? 5} onChange={(n) => patch({ n }, 'n')} />}
          {(sel.kind === 'buttons' || sel.kind === 'zipper') && (
            <Slider label={t.detailLen} min={5} max={100} value={(sel.len ?? 0.5) * 100} onChange={(v) => patch({ len: v / 100 }, 'len')} />
          )}
          {sel.kind === 'ruffle' && (
            <Field label={t.detailHost}>
              <Chips options={entries(t.hosts)} value={sel.host ?? 'hem'} onChange={(host) => patch({ host }, 'host')} />
            </Field>
          )}
          {sel.kind === 'embroidery' && (
            <Field label={t.motif}>
              <Chips options={t.motifs.map((m, i) => [String(i), m] as const)} value={String(sel.n ?? 0)} onChange={(v) => patch({ n: Number(v) }, 'motif')} />
            </Field>
          )}
          {!noDrag && FREE_KINDS.includes(sel.kind) && <p className="text-xs text-muted">{t.dragHint}</p>}
          <button className="btn btn-ghost w-full text-sm" onClick={remove}><IconTrash />{t.removeDetail}</button>
        </div>
      )}
    </div>
  );
}
