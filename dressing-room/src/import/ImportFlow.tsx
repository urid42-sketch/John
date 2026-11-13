import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDoll, addGarment, type GarmentMeta } from '../db/repo';
import { requestPersist } from '../db/storage';
import { he } from '../i18n/he';
import { buildCutout, decodeToCanvas, hasTransparency, maskFromOwnAlpha, releaseCanvas } from '../imaging/load';
import { errorText } from '../ui/errors';
import { IconBack, IconClose } from '../ui/icons';
import { toast, toastError } from '../ui/toast';
import { CropStep } from './CropStep';
import { CutoutStep } from './CutoutStep';
import { emptyMeta, MetaForm } from './MetaForm';
import { SourceStep } from './SourceStep';
import type { Origin, Picked } from './sources';

type Step = 'source' | 'crop' | 'cutout' | 'meta';

// Lets other screens (e.g. a paste on the wardrobe) hand an image to the flow.
let pending: Picked | null = null;
export function setPendingImport(p: Picked) { pending = p; }

export function ImportFlow() {
  const params = useParams();
  const kind: 'garment' | 'doll' = params.kind === 'doll' ? 'doll' : 'garment';
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('source');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<GarmentMeta>(emptyMeta);
  const [dollName, setDollName] = useState('');
  const [, bump] = useState(0);

  const source = useRef<HTMLCanvasElement | null>(null);
  const cropped = useRef<HTMLCanvasElement | null>(null);
  const initialMask = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const origin = useRef<Origin>({ type: 'file' });

  const pick = useCallback(async (p: Picked) => {
    setLoading(true);
    try {
      releaseCanvas(source.current);
      source.current = await decodeToCanvas(p.blob, kind === 'doll' ? 2048 : 1536);
      origin.current = p.origin;
      setStep('crop');
    } catch (e) {
      toastError(errorText(e, he.errors.decode));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (pending) { const p = pending; pending = null; void pick(p); }
  }, [pick]);
  useEffect(() => () => {
    for (const r of [source, cropped, initialMask, mask]) releaseCanvas(r.current);
  }, []);

  const onCropped = (c: HTMLCanvasElement) => {
    if (cropped.current && cropped.current !== source.current) releaseCanvas(cropped.current);
    cropped.current = c;
    releaseCanvas(initialMask.current);
    initialMask.current = hasTransparency(c) ? maskFromOwnAlpha(c) : null;
    setStep('cutout');
  };

  const save = async () => {
    if (!cropped.current || !mask.current) return;
    setSaving(true);
    try {
      const cut = await buildCutout(cropped.current, mask.current);
      if (kind === 'doll') {
        await addDoll(dollName.trim() || he.dolls.defaultName, cut);
        void requestPersist();
        nav('/', { replace: true });
      } else {
        const name = meta.name.trim() || he.categoryOne[meta.category];
        const g = await addGarment({ ...meta, name }, cut, origin.current);
        void requestPersist();
        toast(he.garment.added);
        nav(`/wardrobe?cat=${g.category}`, { replace: true });
      }
    } catch (e) {
      console.error(e);
      toastError(errorText(e, he.errors.saveFailed));
      setSaving(false);
    }
  };

  const back = () => {
    if (saving) return;
    if (step === 'source') nav(-1);
    else if (step === 'crop') setStep('source');
    else if (step === 'cutout') setStep('crop');
    else { initialMask.current = mask.current; mask.current = null; setStep('cutout'); }
    bump((n) => n + 1);
  };

  const title = {
    source: kind === 'doll' ? he.import.titleDoll : he.import.titleGarment,
    crop: he.import.cropTitle, cutout: he.import.cutoutTitle, meta: he.import.metaTitle,
  }[step];

  return (
    <div className="flex h-full flex-col bg-cream">
      <header className="safe-t flex items-center gap-2 px-2 py-2">
        <button className="flex h-12 w-12 items-center justify-center disabled:opacity-40" onClick={back} disabled={saving} aria-label={he.common.back}>
          {step === 'source' ? <IconClose /> : <IconBack />}
        </button>
        <h1 className="flex-1 font-serif text-xl">{title}</h1>
      </header>

      {loading && (
        <div className="flex flex-1 items-center justify-center text-muted" role="status">{he.common.loading}</div>
      )}
      {!loading && step === 'source' && <SourceStep kind={kind} onPick={pick} />}
      {!loading && step === 'crop' && source.current && (
        <CropStep
          source={source.current}
          hint={kind === 'doll' ? he.import.cropHintDoll : he.import.cropHint}
          onDone={onCropped}
        />
      )}
      {!loading && step === 'cutout' && cropped.current && (
        <CutoutStep
          key={`${cropped.current.width}x${cropped.current.height}`}
          source={cropped.current}
          initialMask={initialMask.current}
          onDone={(m) => { mask.current = m; setStep('meta'); }}
        />
      )}
      {!loading && step === 'meta' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {kind === 'doll' ? (
              <label className="block">
                <span className="mb-2 block text-sm text-muted">{he.garment.name}</span>
                <input
                  type="text" value={dollName} maxLength={40} placeholder={he.dolls.namePlaceholder}
                  onChange={(e) => setDollName(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-line bg-paper px-4 outline-none focus:border-rose"
                />
              </label>
            ) : (
              <MetaForm value={meta} onChange={setMeta} />
            )}
          </div>
          <div className="safe-b p-4">
            <button className="btn btn-primary w-full" disabled={saving} onClick={() => void save()}>
              {saving ? he.import.saving : he.common.save}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
