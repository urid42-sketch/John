import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/schema';
import { CANONICAL, CANONICAL_SIZE } from '../engine/body';
import { generate } from '../engine/generate';
import { renderMannequin } from '../engine/mannequin';
import { renderGarment } from '../engine/render';
import { fromTemplate, TEMPLATE_IDS } from '../engine/templates';
import type { TemplateId } from '../engine/types';
import { he } from '../i18n/he';
import { Thumb } from '../ui/Thumb';

const CARD_SCALE = 0.5; // garment units → card canvas px (kept small: seven cards render at once)
let figure: HTMLCanvasElement | null = null;
function sharedFigure() {
  figure ??= renderMannequin(CANONICAL, CANONICAL_SIZE.w, CANONICAL_SIZE.h, CARD_SCALE);
  return figure;
}

function TemplateCard({ id }: { id: TemplateId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const d = fromTemplate(id);
    d.seed = 5;
    const g = generate(d, CANONICAL);
    const fig = sharedFigure();
    c.width = fig.width; c.height = fig.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(fig, 0, 0);
    const garment = renderGarment(g, d, CARD_SCALE);
    ctx.drawImage(garment, g.bbox.x * CARD_SCALE, g.bbox.y * CARD_SCALE);
    garment.width = 0;
  }, [id]);
  return (
    <Link
      to={`/studio/new/${id}`}
      className="flex flex-col items-center rounded-3xl border border-line bg-gradient-to-b from-paper to-rose-soft/50 px-2 pb-3 pt-2 active:scale-[0.98]"
    >
      <div className="aspect-[3/5] w-full"><canvas ref={ref} className="h-full w-full object-contain" /></div>
      <span className="mt-1 text-sm">{he.studio.templates[id]}</span>
    </Link>
  );
}

export function StudioHome() {
  const mine = useLiveQuery(
    async () => (await db.garments.orderBy('updatedAt').reverse().toArray()).filter((g) => g.body.kind === 'design'),
    [],
  );
  return (
    <div className="h-full overflow-y-auto px-4 pb-6">
      <h2 className="py-2 font-serif text-xl">{he.studio.newTitle}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TEMPLATE_IDS.map((id) => <li key={id}><TemplateCard id={id} /></li>)}
      </ul>
      <h2 className="pb-2 pt-6 font-serif text-xl">{he.studio.mine}</h2>
      {mine?.length === 0 && <p className="text-sm text-muted">{he.studio.mineEmpty}</p>}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {mine?.map((g) => (
          <li key={g.id}>
            <Link to={`/studio/edit/${g.id}`} className="block rounded-3xl border border-line bg-paper p-3 active:bg-rose-soft">
              <div className="aspect-[3/4]"><Thumb blob={g.thumb} alt={g.name} /></div>
              <p className="mt-2 truncate text-center text-xs">{g.name}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
