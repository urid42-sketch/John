import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../db/schema';
import { CATEGORIES, SEASONS, type Category } from '../db/types';
import { he } from '../i18n/he';
import { setPendingImport } from '../import/ImportFlow';
import { fromDataTransfer } from '../import/sources';
import { IconFilter, IconPlus } from '../ui/icons';
import { Thumb } from '../ui/Thumb';

export function WardrobeScreen() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const cat = (CATEGORIES as string[]).includes(params.get('cat') ?? '') ? (params.get('cat') as Category) : null;
  const [tags, setTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const garments = useLiveQuery(() => db.garments.orderBy('updatedAt').reverse().toArray(), []);

  // Paste or drop an image anywhere on the wardrobe to start an import.
  useEffect(() => {
    const start = (dt: DataTransfer | null, type: 'paste' | 'file', e: Event) => {
      const p = fromDataTransfer(dt, type);
      if (!p) return;
      e.preventDefault();
      setPendingImport(p);
      nav('/import/garment');
    };
    const onPaste = (e: ClipboardEvent) => start(e.clipboardData, 'paste', e);
    const onDrop = (e: DragEvent) => start(e.dataTransfer, 'file', e);
    const onOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('paste', onPaste);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onOver);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onOver);
    };
  }, [nav]);

  const shown = useMemo(
    () => (garments ?? []).filter((g) => (!cat || g.category === cat) && tags.every((t) => g.tagIndex.includes(t))),
    [garments, cat, tags],
  );
  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const tagChip = (key: string, label: string) => (
    <button key={key} className="chip" aria-pressed={tags.includes(key)} onClick={() => toggleTag(key)}>{label}</button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 overflow-x-auto px-4 py-2" role="tablist">
        <button className="chip" aria-pressed={!cat} onClick={() => setParams({}, { replace: true })}>{he.wardrobe.all}</button>
        {CATEGORIES.map((c) => (
          <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setParams({ cat: c }, { replace: true })}>
            {he.categories[c]}
          </button>
        ))}
      </div>
      <div className="px-4">
        <button
          className="flex min-h-11 items-center gap-2 text-sm text-muted" aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <IconFilter />{he.wardrobe.filters}{tags.length > 0 && ` (${tags.length})`}
        </button>
        {showFilters && (
          <div className="space-y-2 pb-3">
            <div className="flex flex-wrap gap-2">{he.tags.colors.map((c) => tagChip(`color:${c}`, c))}</div>
            <div className="flex flex-wrap gap-2">{he.tags.occasions.map((o) => tagChip(`occasion:${o}`, o))}</div>
            <div className="flex flex-wrap gap-2">{SEASONS.map((s) => tagChip(`season:${s}`, he.tags.seasons[s]))}</div>
            {tags.length > 0 && (
              <button className="min-h-11 text-sm text-rose-deep underline" onClick={() => setTags([])}>
                {he.wardrobe.clearFilters}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24">
        {garments && garments.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <h2 className="font-serif text-2xl">{he.wardrobe.empty}</h2>
            <p className="text-muted">{he.wardrobe.emptyHint}</p>
          </div>
        )}
        {garments && garments.length > 0 && shown.length === 0 && (
          <p className="py-12 text-center text-muted">{he.wardrobe.noMatch}</p>
        )}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((g) => (
            <li key={g.id}>
              <Link to={`/garment/${g.id}`} className="block rounded-3xl border border-line bg-paper p-3">
                <div className="aspect-[3/4]"><Thumb blob={g.thumb} alt={g.name} /></div>
                <p className="mt-2 truncate text-center text-sm">{g.name}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Link
        to="/import/garment" aria-label={he.wardrobe.add}
        className="btn btn-primary absolute bottom-4 end-4 shadow-lg"
      >
        <IconPlus />{he.wardrobe.add}
      </Link>
    </div>
  );
}
