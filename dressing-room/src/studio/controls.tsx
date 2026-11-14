import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs text-muted">{label}</legend>
      {children}
    </fieldset>
  );
}

export function Chips<T extends string>({ options, value, onChange, disabled = [] }: {
  options: readonly (readonly [T, string])[]; value: T | null; onChange: (v: T) => void; disabled?: readonly T[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v} type="button" className="chip disabled:opacity-35" aria-pressed={value === v}
          disabled={disabled.includes(v)} onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min = 0, max = 100, onChange, start, end }: {
  label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; start?: string; end?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 flex justify-between text-xs text-muted">
        <span>{label}</span>
        {start && end && <span>{start} ← → {end}</span>}
      </span>
      <input
        type="range" min={min} max={max} value={Math.round(value)} className="h-11 w-full"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export const PALETTE = [
  '#1f1b1c', '#ffffff', '#f4ece4', '#d7b9a0', '#8a5a44', '#b9797c', '#c2253c', '#e9a8b6',
  '#7b4b94', '#27408b', '#6d8fb5', '#2f6f5e', '#9bb38b', '#e3c14a', '#e07b39', '#8d8f93',
];

export function Swatches({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2">
        {PALETTE.map((c) => (
          <button
            key={c} type="button" aria-label={c} aria-pressed={value.toLowerCase() === c}
            onClick={() => onChange(c)}
            className={`h-10 w-10 rounded-full border ${value.toLowerCase() === c ? 'border-rose ring-2 ring-rose' : 'border-line'}`}
            style={{ background: c }}
          />
        ))}
        <input
          type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#b9797c'} aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded-full border border-line bg-paper p-0.5"
        />
      </div>
    </Field>
  );
}
