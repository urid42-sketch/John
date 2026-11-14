import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shareImage } from '../canvas/exportLook';
import { getBlob } from '../db/blobs';
import { deleteLook, openLookInTryOn, toggleLookFavorite } from '../db/repo';
import { db } from '../db/schema';
import { DRAFT_LOOK_ID, type ID, type Look } from '../db/types';
import { he } from '../i18n/he';
import { errorText } from '../ui/errors';
import { IconClose, IconHeart, IconTrash } from '../ui/icons';
import { Thumb } from '../ui/Thumb';
import { toast, toastError } from '../ui/toast';

const t = he.looks;

export function LooksScreen() {
  const nav = useNavigate();
  const looks = useLiveQuery(
    async () => (await db.looks.orderBy('updatedAt').reverse().toArray()).filter((l) => l.id !== DRAFT_LOOK_ID && l.render),
    [],
  );
  const [onlyFav, setOnlyFav] = useState(false);
  const [openId, setOpenId] = useState<ID | null>(null);
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<ID[]>([]);

  const shown = (looks ?? []).filter((l) => !onlyFav || l.favorite);
  const open = looks?.find((l) => l.id === openId) ?? null;
  const pair = picked.map((id) => looks?.find((l) => l.id === id)).filter((l): l is Look => !!l);
  const guard = (fn: () => Promise<void>) => () => { fn().catch((e) => toastError(errorText(e))); };

  const tap = (l: Look) => {
    if (!comparing) { setOpenId(l.id); return; }
    setPicked((cur) => (cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id].slice(-2)));
  };
  const exportLook = guard(async () => {
    if (!open?.render) return;
    const blob = await getBlob(open.render);
    if (blob) await shareImage(blob, open.name || 'look');
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-2">
        <button className="chip" aria-pressed={!onlyFav} onClick={() => setOnlyFav(false)}>{t.all}</button>
        <button className="chip" aria-pressed={onlyFav} onClick={() => setOnlyFav(true)}>{t.favorites}</button>
        <span className="flex-1" />
        {(looks?.length ?? 0) >= 2 && (
          <button className="chip" aria-pressed={comparing} onClick={() => { setComparing((v) => !v); setPicked([]); }}>
            {comparing ? t.compareDone : t.compare}
          </button>
        )}
      </div>
      {comparing && pair.length < 2 && <p className="px-4 pb-2 text-sm text-muted">{t.comparePick}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {looks?.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <h2 className="font-serif text-2xl">{t.empty}</h2>
            <p className="max-w-xs text-muted">{t.emptyHint}</p>
          </div>
        )}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => tap(l)} aria-label={l.name} aria-pressed={comparing ? picked.includes(l.id) : undefined}
                className={`relative block w-full overflow-hidden rounded-3xl border bg-paper ${picked.includes(l.id) ? 'border-rose ring-2 ring-rose' : 'border-line'}`}
              >
                <div className="aspect-[3/4]"><Thumb blob={l.thumb!} alt="" className="!object-cover" /></div>
                {l.favorite && <span className="absolute start-2 top-2 text-rose"><IconHeart /></span>}
                {l.ai && <span className="absolute end-2 top-2 rounded-full bg-paper/90 px-2 py-0.5 text-xs text-rose-deep">{t.aiBadge}</span>}
                <span className="block truncate px-2 py-2 text-sm">{l.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {comparing && pair.length === 2 && (
        <div className="absolute inset-0 z-20 flex flex-col bg-cream">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="font-serif text-lg">{t.compare}</h2>
            <button className="flex h-11 w-11 items-center justify-center" onClick={() => setPicked([])} aria-label={he.common.close}><IconClose /></button>
          </div>
          <div className="flex min-h-0 flex-1 gap-2 px-2 pb-3" dir="ltr">
            {pair.map((l) => (
              <figure key={l.id} className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-paper">
                <div className="min-h-0 flex-1"><Thumb blob={l.render!} alt={l.name} /></div>
                <figcaption className="truncate p-2 text-center text-sm" dir="rtl">{l.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="absolute inset-0 z-20 flex flex-col bg-cream">
          <div className="flex items-center gap-2 px-4 py-2">
            <h2 className="min-w-0 flex-1 truncate font-serif text-lg">{open.name}</h2>
            <button className="flex h-11 w-11 items-center justify-center" onClick={() => setOpenId(null)} aria-label={he.common.close}><IconClose /></button>
          </div>
          <div className="min-h-0 flex-1 px-3"><Thumb blob={open.render!} alt={open.name} /></div>
          <div className="space-y-2 p-3">
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1" onClick={exportLook}>{t.export}</button>
              <button
                className={`btn btn-ghost !px-4 ${open.favorite ? 'text-rose' : ''}`} aria-pressed={open.favorite}
                aria-label={open.favorite ? t.unfavorite : t.favorite} onClick={guard(() => toggleLookFavorite(open.id, !open.favorite))}
              >
                <IconHeart />
              </button>
              <button
                className="btn btn-ghost !px-4" aria-label={he.common.delete}
                onClick={guard(async () => { if (!confirm(t.deleteConfirm)) return; await deleteLook(open.id); setOpenId(null); toast(t.deleted); })}
              >
                <IconTrash />
              </button>
            </div>
            {!open.ai && open.items.length > 0 && (
              <button className="btn btn-ghost w-full" onClick={guard(async () => { await openLookInTryOn(open); nav('/'); })}>{t.open}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
