import { he } from '../i18n/he';

export function SoonScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="rounded-full bg-rose-soft px-3 py-1 text-xs text-rose-deep">{he.common.soon}</span>
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="max-w-xs text-muted">{body}</p>
    </div>
  );
}
