import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/schema';
import { CANONICAL } from '../engine/body';
import { generate } from '../engine/generate';
import { renderGarment } from '../engine/render';
import { fromTemplate, TEMPLATE_IDS } from '../engine/templates';
import type { TemplateId } from '../engine/types';
import { he } from '../i18n/he';
import { Thumb } from '../ui/Thumb';

const COLORS: Record<TemplateId, string> = {
  aline: '#b9797c', bodycon: '#1f1b1c', mermaid: '#2f6f5e', maxi: '#6d8fb5', skirt: '#e3c14a', top: '#f4ece4', pants: '#27408b',
};

function TemplateCard({ id }: { id: TemplateId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const d = fromTemplate(id);
    d.seed = 5;
    d.fabric = { ...d.fabric, kind: id === 'pants' ? 'denim' : 'satin', colors: [COLORS[id], '#f4ece4', '#3b302c'], sheen: id === 'pants' ? 0 : 0.5 };
    const g = generate(d, CANONICAL);
    renderGarment(g, d, 220 / Math.max(g.bbox.w, g.bbox.h), c);
    return () => { c.width = 0; c.height = 0; };
  }, [id]);
  return (
    <Link to={`/studio/new/${id}`} className="flex flex-col items-center rounded-3xl border border-line bg-paper p-3 active:bg-rose-soft">
      <div className="flex aspect-[3/4] w-full items-center justify-center"><canvas ref={ref} className="max-h-full max-w-full" /></div>
      <span className="mt-2 text-sm">{he.studio.templates[id]}</span>
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
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
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
