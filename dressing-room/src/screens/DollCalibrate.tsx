import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { detectCalibration } from '../canvas/autoPlace';
import { getBlob, useBlobUrl } from '../db/blobs';
import { updateDollCalibration } from '../db/repo';
import { db } from '../db/schema';
import type { BodyCalibration } from '../db/types';
import { DEFAULT_CALIBRATION } from '../engine/body';
import { he } from '../i18n/he';
import { errorText } from '../ui/errors';
import { Page } from '../ui/Page';
import { toast, toastError } from '../ui/toast';
import { useFit } from '../ui/useFit';

const PAIRS = [
  ['shoulder', 'shoulderL', 'shoulderR'], ['waist', 'waistL', 'waistR'], ['hip', 'hipL', 'hipR'],
  ['wrist', 'wristL', 'wristR'], ['ankle', 'ankleL', 'ankleR'],
] as const;
type Key = keyof BodyCalibration;

export function DollCalibrate() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const doll = useLiveQuery(() => db.dolls.get(id).then((d) => d ?? null), [id]);
  const url = useBlobUrl(doll?.cutout);
  const area = useRef<HTMLDivElement>(null);
  const fit = useFit(area, doll?.w ?? 1, doll?.h ?? 1);
  const [cal, setCal] = useState<BodyCalibration>(DEFAULT_CALIBRATION);
  const loaded = useRef(false);
  useEffect(() => {
    if (doll && !loaded.current) { loaded.current = true; setCal(doll.calibration ?? DEFAULT_CALIBRATION); }
  }, [doll]);

  const drag = useRef<{ id: number; key: Key } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const down = (key: Key) => (e: RPointerEvent) => {
    if (drag.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, key };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current, r = box.current?.getBoundingClientRect();
    if (!d || d.id !== e.pointerId || !r?.width) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setCal((c) => ({ ...c, [d.key]: { x, y } }));
  };
  const up = (e: RPointerEvent) => { if (drag.current?.id === e.pointerId) drag.current = null; };

  if (doll === undefined) return <Page title={he.calibrate.title}>{null}</Page>;
  if (doll === null) return <Page title={he.calibrate.title}><p className="p-8 text-center text-muted">{he.garment.notFound}</p></Page>;

  const detect = async () => {
    const blob = await getBlob(doll.cutout).catch(() => null);
    const found = blob ? await detectCalibration(blob) : null;
    if (found) setCal(found); else { setCal(DEFAULT_CALIBRATION); toastError(he.calibrate.detectFailed); }
  };
  const save = async () => {
    try { await updateDollCalibration(doll.id, cal); toast(he.calibrate.saved); nav(-1); }
    catch (e) { toastError(errorText(e, he.errors.saveFailed)); }
  };

  return (
    <Page
      title={he.calibrate.title}
      footer={
        <div className="flex gap-2">
          <button className="btn btn-ghost !px-4" onClick={() => void detect()}>{he.calibrate.detect}</button>
          <button className="btn btn-primary flex-1" onClick={() => void save()}>{he.common.save}</button>
        </div>
      }
    >
      <div className="flex h-full flex-col">
        <p className="px-4 pb-2 text-center text-sm text-muted">{he.calibrate.hint}</p>
        <div ref={area} className="relative min-h-0 flex-1 px-6 pb-2">
          <div className="flex h-full items-center justify-center">
            <div ref={box} dir="ltr" className="relative select-none" style={{ width: fit.width, height: fit.height }}>
              {url && <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full opacity-90" />}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {PAIRS.map(([name, a, b]) => (
                  <line key={name} x1={cal[a].x * 100} y1={cal[a].y * 100} x2={cal[b].x * 100} y2={cal[b].y * 100}
                    stroke="#b9797c" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              {PAIRS.flatMap(([name, a, b]) => [a, b].map((key, i) => (
                <div
                  key={key} role="slider" aria-label={he.calibrate.points[name]} aria-valuenow={Math.round(cal[key].y * 100)}
                  onPointerDown={down(key)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                  className="absolute flex h-12 w-12 items-center justify-center"
                  style={{ left: `${cal[key].x * 100}%`, top: `${cal[key].y * 100}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
                >
                  <span className="h-5 w-5 rounded-full border-2 border-white bg-rose shadow" />
                  {i === 1 && (
                    <span className="pointer-events-none absolute start-full whitespace-nowrap rounded-full bg-paper/90 px-2 text-xs" dir="rtl">
                      {he.calibrate.points[name]}
                    </span>
                  )}
                </div>
              )))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
