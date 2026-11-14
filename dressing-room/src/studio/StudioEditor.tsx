import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { saveDesign } from '../db/repo';
import { db } from '../db/schema';
import type { GarmentVersion, ID } from '../db/types';
import { fromTemplate, migrateDesign, normalizeDesign, TEMPLATE_IDS } from '../engine/templates';
import type { GarmentDesign, TemplateId } from '../engine/types';
import { he } from '../i18n/he';
import { errorText } from '../ui/errors';
import { IconBack, IconClose, IconUndo } from '../ui/icons';
import { Thumb } from '../ui/Thumb';
import { toast, toastError } from '../ui/toast';
import { CutPanel, DetailsPanel, FabricPanel, FREE_KINDS } from './panels';
import { Preview } from './Preview';
import { renderDesignForSave } from './renderDesign';
import { useHistory } from './useHistory';

const t = he.studio;
type Tab = 'cut' | 'fabric' | 'details';

export function StudioEditor() {
  const { template, id } = useParams();
  const nav = useNavigate();
  const initial = (TEMPLATE_IDS as string[]).includes(template ?? '') ? (template as TemplateId) : 'aline';
  const history = useHistory<GarmentDesign>(fromTemplate(initial));
  const { value: design, reset } = history;
  const [garmentId, setGarmentId] = useState<ID | null>(id ?? null);
  const [name, setName] = useState('');
  const [ready, setReady] = useState(!id);
  const [tab, setTab] = useState<Tab>('cut');
  const [selDetail, setSelDetail] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'save' | 'versions' | null>(null);
  const [saving, setSaving] = useState(false);
  const savedDesign = useRef<GarmentDesign | null>(null);
  const [, bumpSaved] = useState(0);
  if (savedDesign.current === null) savedDesign.current = design; // a fresh template counts as clean
  const dirty = design !== savedDesign.current;

  const dolls = useLiveQuery(() => db.dolls.toArray(), []);
  const doll = dolls?.find((d) => d.isDefault) ?? dolls?.[0] ?? null;
  const versions = useLiveQuery(
    async (): Promise<GarmentVersion[]> =>
      (garmentId ? (await db.garmentVersions.where('garmentId').equals(garmentId).sortBy('createdAt')).reverse() : []),
    [garmentId],
  );

  // Editing an existing design: load it once.
  useEffect(() => {
    if (!id) return;
    db.garments.get(id).then((g) => {
      if (!g || g.body.kind !== 'design') { toastError(he.garment.notFound); nav('/studio', { replace: true }); return; }
      const loaded = migrateDesign(g.body.design);
      savedDesign.current = loaded;
      reset(loaded);
      setName(g.name);
      setReady(true);
    }).catch((e) => { toastError(errorText(e, he.errors.loadFailed)); nav('/studio', { replace: true }); });
  }, [id, nav, reset]);

  const set = (d: GarmentDesign, key?: string) => history.set(normalizeDesign(d), key);
  const sel = design.details.find((x) => x.id === selDetail) ?? null;

  const leave = () => { if (!dirty || confirm(t.leaveConfirm)) nav(-1); };

  const save = async (asCopy: boolean) => {
    setSaving(true);
    try {
      const render = await renderDesignForSave(design);
      const finalName = name.trim() || t.defaultName(t.templates[design.template]);
      const g = await saveDesign(asCopy ? `${finalName} (עותק)` : finalName, design, render, asCopy ? undefined : garmentId ?? undefined);
      setGarmentId(g.id);
      setName(g.name);
      savedDesign.current = design;
      bumpSaved((n) => n + 1);
      setSheet(null);
      toast(asCopy ? t.copySaved : t.saved);
    } catch (e) {
      console.error(e);
      toastError(errorText(e, he.errors.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <div className="flex h-full items-center justify-center text-muted" role="status">{he.common.loading}</div>;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col bg-cream">
      <header className="safe-t flex items-center gap-1 px-2 py-1">
        <button className="flex h-12 w-12 items-center justify-center" onClick={leave} aria-label={he.common.back}><IconBack /></button>
        <h1 className="min-w-0 flex-1 truncate font-serif text-lg">{name || t.templates[design.template]}</h1>
        <button className="flex h-12 w-11 items-center justify-center disabled:opacity-30" onClick={history.undo} disabled={!history.canUndo} aria-label={t.undo}><IconUndo /></button>
        <button className="flex h-12 w-11 -scale-x-100 items-center justify-center disabled:opacity-30" onClick={history.redo} disabled={!history.canRedo} aria-label={t.redo}><IconUndo /></button>
        {garmentId && <button className="min-h-11 px-2 text-sm text-muted" onClick={() => setSheet('versions')}>{t.versions}</button>}
        <button className="btn btn-primary !min-h-10 !px-4 text-sm" onClick={() => setSheet('save')}>{t.save}</button>
      </header>

      <div className="relative min-h-0 flex-[5] bg-paper">
        <Preview
          design={design} doll={doll}
          dragDetail={tab === 'details' && !!sel && FREE_KINDS.includes(sel.kind)}
          onDragDetail={(x, y) => { if (sel) set({ ...design, details: design.details.map((d) => (d.id === sel.id ? { ...d, x, y } : d)) }, `${sel.id}:drag`); }}
        />
        {doll && tab === 'cut' && (
          <Link to={`/dolls/${doll.id}/calibrate`} className="absolute end-2 top-2 flex min-h-10 items-center rounded-full bg-cream/90 px-3 text-xs text-muted">{t.calibrate}</Link>
        )}
        {dolls && !doll && <p className="absolute inset-x-0 bottom-1 px-6 text-center text-xs text-muted">{t.noDoll}</p>}
      </div>

      <div className="flex border-y border-line bg-paper" role="tablist">
        {(Object.keys(t.tabs) as Tab[]).map((k) => (
          <button
            key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-12 flex-1 text-sm ${tab === k ? 'border-b-2 border-rose font-medium text-rose-deep' : 'text-muted'}`}
          >
            {t.tabs[k]}
          </button>
        ))}
      </div>
      <div className="safe-b min-h-0 flex-[4] overflow-y-auto p-4">
        {tab === 'cut' && <CutPanel d={design} set={set} />}
        {tab === 'fabric' && <FabricPanel d={design} set={set} />}
        {tab === 'details' && <DetailsPanel d={design} set={set} selected={selDetail} onSelect={setSelDetail} />}
      </div>

      {sheet && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-ink/30" onClick={() => !saving && setSheet(null)}>
          <div className="safe-b mx-auto max-h-[80%] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-paper p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={sheet === 'save' ? t.saveTitle : t.versionsTitle}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg">{sheet === 'save' ? t.saveTitle : t.versionsTitle}</h2>
              <button className="flex h-11 w-11 items-center justify-center" onClick={() => setSheet(null)} disabled={saving} aria-label={he.common.close}><IconClose /></button>
            </div>
            {sheet === 'save' ? (
              <div className="space-y-3">
                <input
                  type="text" value={name} maxLength={60} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-line bg-cream px-4 outline-none focus:border-rose"
                />
                <button className="btn btn-primary w-full" disabled={saving} onClick={() => void save(false)}>{saving ? he.import.saving : t.save}</button>
                {garmentId && <button className="btn btn-ghost w-full" disabled={saving} onClick={() => void save(true)}>{t.saveCopy}</button>}
              </div>
            ) : (
              <>
                {versions?.length === 0 && <p className="py-6 text-center text-sm text-muted">{t.versionsEmpty}</p>}
                <ul className="grid grid-cols-3 gap-2">
                  {versions?.map((v) => (
                    <li key={v.id}>
                      <button
                        className="block w-full rounded-2xl border border-line p-2 active:bg-rose-soft" aria-label={t.restore}
                        onClick={() => { history.set(migrateDesign(v.design)); setSheet(null); toast(t.restored); }}
                      >
                        <div className="aspect-[3/4]"><Thumb blob={v.thumb} alt="" /></div>
                        <span className="mt-1 block text-center text-xs text-muted" dir="ltr">
                          {new Date(v.createdAt).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
