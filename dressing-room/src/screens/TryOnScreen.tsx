import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { normalizeDeg } from '../canvas/gesture';
import { TryOnStage } from '../canvas/TryOnStage';
import { getDraft, newPlacedItem, saveDraft } from '../db/repo';
import { db } from '../db/schema';
import { CATEGORIES, type Category, type Garment, type ID, type PlacedItem } from '../db/types';
import { he } from '../i18n/he';
import { errorText } from '../ui/errors';
import { IconClose, IconCopy, IconDown, IconFilter, IconFlip, IconHanger, IconTrash, IconUp } from '../ui/icons';
import { Thumb } from '../ui/Thumb';
import { toast, toastError } from '../ui/toast';

function Welcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto p-8 text-center">
      <h2 className="font-serif text-3xl">{he.welcome.title}</h2>
      <p className="max-w-xs leading-relaxed text-muted">{he.welcome.body}</p>
      <div className="w-full max-w-xs rounded-3xl border border-line bg-paper p-5 text-start">
        <h3 className="mb-2 text-sm font-medium">{he.welcome.tipsTitle}</h3>
        <ul className="space-y-1 text-sm text-muted">
          {he.welcome.tips.map((t) => <li key={t}>· {t}</li>)}
        </ul>
      </div>
      <Link to="/import/doll" className="btn btn-primary w-full max-w-xs">{he.welcome.addPhoto}</Link>
      <p className="max-w-xs text-xs text-muted">{he.welcome.privacy}</p>
    </div>
  );
}

function ToolButton({ label, onClick, children, pressed }: {
  label: string; onClick: () => void; children: ReactNode; pressed?: boolean;
}) {
  return (
    <button
      onClick={onClick} aria-pressed={pressed}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs active:bg-rose-soft ${pressed ? 'text-rose-deep' : ''}`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function WardrobeDrawer({ garments, onPick, onClose }: {
  garments: Garment[]; onPick: (g: Garment) => void; onClose: () => void;
}) {
  const [cat, setCat] = useState<Category | null>(null);
  const shown = cat ? garments.filter((g) => g.category === cat) : garments;
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-ink/25" onClick={onClose}>
      <div className="max-h-[70%] rounded-t-3xl bg-paper shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={he.tryon.openWardrobe}>
        <div className="flex items-center justify-between px-4 pt-2">
          <h2 className="font-serif text-lg">{he.wardrobe.title}</h2>
          <button className="flex h-12 w-12 items-center justify-center" onClick={onClose} aria-label={he.common.close}><IconClose /></button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-2">
          <button className="chip" aria-pressed={!cat} onClick={() => setCat(null)}>{he.wardrobe.all}</button>
          {CATEGORIES.map((c) => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{he.categories[c]}</button>
          ))}
        </div>
        <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: '45vh' }}>
          {garments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-muted">{he.tryon.emptyWardrobe}</p>
              <Link to="/import/garment" className="btn btn-primary">{he.wardrobe.add}</Link>
            </div>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-muted">{he.wardrobe.noMatch}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {shown.map((g) => (
                <li key={g.id}>
                  <button className="block w-full rounded-2xl border border-line p-2 active:bg-rose-soft" onClick={() => onPick(g)} aria-label={g.name}>
                    <div className="aspect-[3/4]"><Thumb blob={g.thumb} alt="" /></div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function TryOnScreen() {
  const dolls = useLiveQuery(() => db.dolls.orderBy('createdAt').toArray(), []);
  const garmentList = useLiveQuery(() => db.garments.orderBy('updatedAt').reverse().toArray(), []);
  const garments = useMemo(() => new Map((garmentList ?? []).map((g) => [g.id, g])), [garmentList]);

  const [items, setItems] = useState<PlacedItem[] | null>(null);
  const [dollId, setDollId] = useState<ID | null>(null);
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [tune, setTune] = useState(false);

  useEffect(() => {
    getDraft()
      .then((d) => { setItems(d.items); setDollId(d.dollId); })
      .catch((e) => { toastError(errorText(e, he.errors.loadFailed)); setItems([]); });
  }, []);

  const doll = useMemo(() => {
    if (!dolls?.length) return null;
    return dolls.find((d) => d.id === dollId) ?? dolls.find((d) => d.isDefault) ?? dolls[0];
  }, [dolls, dollId]);

  // Persist the session (debounced) so a reload restores it.
  const latest = useRef<{ dollId: ID | null; items: PlacedItem[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const s = latest.current;
    if (!s) return;
    latest.current = null;
    saveDraft(s.dollId, s.items).catch((e) => toastError(errorText(e, he.errors.saveFailed)));
  }, []);
  const persist = useCallback((next: PlacedItem[], nextDoll: ID | null) => {
    latest.current = { dollId: nextDoll, items: next };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [flush]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  const activeDollId = doll?.id ?? null;
  const update = useCallback((next: PlacedItem[], commit = true) => {
    setItems(next);
    if (commit) persist(next, activeDollId);
  }, [persist, activeDollId]);

  // Drop items whose garment was deleted from the wardrobe.
  useEffect(() => {
    if (!items || !garmentList) return;
    const kept = items.filter((i) => garments.has(i.garmentId));
    if (kept.length !== items.length) { toast(he.tryon.missing); update(kept); }
  }, [items, garmentList, garments, update]);

  if (dolls === undefined || items === null) return null;
  if (!doll) return <Welcome />;

  const sel = items.find((i) => i.id === selectedId) ?? null;
  const patchSel = (p: Partial<PlacedItem>, commit = true) => {
    if (sel) update(items.map((i) => (i.id === sel.id ? { ...i, ...p } : i)), commit);
  };
  const reorder = (dir: 1 | -1) => {
    if (!sel) return;
    const order = [...items].sort((a, b) => a.z - b.z);
    const i = order.findIndex((x) => x.id === sel.id), j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update(order.map((x, k) => ({ ...x, z: k + 1 })));
  };
  const duplicate = () => {
    if (!sel) return;
    const copy = { ...sel, id: crypto.randomUUID(), x: sel.x + 0.06, z: Math.max(...items.map((i) => i.z)) + 1 };
    update([...items, copy]);
    setSelectedId(copy.id);
  };
  const remove = () => {
    if (!sel) return;
    update(items.filter((i) => i.id !== sel.id));
    setSelectedId(null);
  };
  const add = (g: Garment) => {
    const it = newPlacedItem(g, items, doll);
    update([...items, it]);
    setSelectedId(it.id);
    setDrawer(false);
  };
  const switchDoll = (id: ID) => { setDollId(id); persist(items, id); };

  return (
    <div className="flex h-full flex-col">
      <div className="closet-bg relative min-h-0 flex-1 overflow-hidden">
        <TryOnStage
          doll={doll} items={items} garments={garments}
          selectedId={selectedId} onSelect={setSelectedId} onChange={update}
        />
        {dolls.length > 1 && (
          <div className="absolute start-3 top-2 flex flex-col gap-2" role="group" aria-label={he.dolls.choose}>
            {dolls.map((d) => (
              <button
                key={d.id} onClick={() => switchDoll(d.id)} aria-label={d.name} aria-pressed={d.id === doll.id}
                className={`h-12 w-12 overflow-hidden rounded-full border-2 bg-paper p-0.5 ${d.id === doll.id ? 'border-rose' : 'border-line'}`}
              >
                <Thumb blob={d.thumb} alt="" />
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && !sel && (
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-muted">{he.tryon.hint}</p>
        )}
        {items.length > 0 && !sel && (
          <button
            className="absolute end-3 top-2 min-h-11 rounded-full bg-paper/90 px-4 text-sm text-muted"
            onClick={() => { if (confirm(he.tryon.clearConfirm)) update([]); }}
          >
            {he.tryon.clear}
          </button>
        )}
      </div>

      <div className="relative border-t border-line bg-paper px-3 py-2">
        {sel && tune && (
          <div className="absolute inset-x-0 bottom-full space-y-1 border-t border-line bg-paper px-4 py-2">
            {([
              ['size', 3, 160, Math.round(sel.scale * 100), (v: number) => ({ scale: v / 100 })],
              ['width', 50, 180, Math.round(sel.stretchX * 100), (v: number) => ({ stretchX: v / 100 })],
              ['rotate', -180, 180, Math.round(sel.rotation), (v: number) => ({ rotation: normalizeDeg(v) })],
            ] as const).map(([key, min, max, val, toPatch]) => (
              <label key={key} className="flex items-center gap-3 text-xs text-muted">
                <span className="w-10 shrink-0">{he.tryon[key]}</span>
                <input
                  type="range" dir={key === 'rotate' ? 'ltr' : undefined} min={min} max={max} value={val} className="h-10 flex-1"
                  onChange={(e) => patchSel(toPatch(Number(e.target.value)))}
                />
              </label>
            ))}
          </div>
        )}
        <div className="flex min-h-16 items-center">
          {sel ? (
            <>
              <ToolButton label={he.tryon.forward} onClick={() => reorder(1)}><IconUp /></ToolButton>
              <ToolButton label={he.tryon.backward} onClick={() => reorder(-1)}><IconDown /></ToolButton>
              <ToolButton label={he.tryon.flip} onClick={() => patchSel({ flipX: !sel.flipX })}><IconFlip /></ToolButton>
              <ToolButton label={he.tryon.tune} onClick={() => setTune((v) => !v)} pressed={tune}><IconFilter /></ToolButton>
              <ToolButton label={he.tryon.duplicate} onClick={duplicate}><IconCopy /></ToolButton>
              <ToolButton label={he.tryon.remove} onClick={remove}><IconTrash /></ToolButton>
            </>
          ) : (
            <button className="btn btn-primary flex-1" onClick={() => setDrawer(true)}>
              <IconHanger />{he.tryon.openWardrobe}
            </button>
          )}
        </div>
      </div>

      {drawer && <WardrobeDrawer garments={garmentList ?? []} onPick={add} onClose={() => setDrawer(false)} />}
    </div>
  );
}
