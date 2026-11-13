import type { GarmentMeta } from '../db/repo';
import { CATEGORIES, SEASONS, type Tags } from '../db/types';
import { he } from '../i18n/he';

export const emptyMeta = (): GarmentMeta => ({
  name: '', category: 'dress', tags: { colors: [], occasions: [], seasons: [], free: [] },
});

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function MetaForm({ value, onChange }: { value: GarmentMeta; onChange: (m: GarmentMeta) => void }) {
  const setTags = (patch: Partial<Tags>) => onChange({ ...value, tags: { ...value.tags, ...patch } });
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm text-muted">{he.garment.name}</span>
        <input
          type="text" value={value.name} maxLength={60} placeholder={he.garment.namePlaceholder}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="h-12 w-full rounded-2xl border border-line bg-paper px-4 outline-none focus:border-rose"
        />
      </label>
      <ChipRow label={he.garment.category}>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={value.category === c}
            onClick={() => onChange({ ...value, category: c })}>{he.categoryOne[c]}</button>
        ))}
      </ChipRow>
      <ChipRow label={he.tags.color}>
        {he.tags.colors.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={value.tags.colors.includes(c)}
            onClick={() => setTags({ colors: toggle(value.tags.colors, c) })}>{c}</button>
        ))}
      </ChipRow>
      <ChipRow label={he.tags.occasion}>
        {he.tags.occasions.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={value.tags.occasions.includes(o)}
            onClick={() => setTags({ occasions: toggle(value.tags.occasions, o) })}>{o}</button>
        ))}
      </ChipRow>
      <ChipRow label={he.tags.season}>
        {SEASONS.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={value.tags.seasons.includes(s)}
            onClick={() => setTags({ seasons: toggle(value.tags.seasons, s) })}>{he.tags.seasons[s]}</button>
        ))}
      </ChipRow>
    </div>
  );
}
