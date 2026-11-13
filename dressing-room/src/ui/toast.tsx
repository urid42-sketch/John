import { useEffect, useState } from 'react';

type ToastMsg = { id: number; text: string; kind: 'info' | 'error' };
let listeners: ((t: ToastMsg) => void)[] = [];
let seq = 0;

export function toast(text: string, kind: ToastMsg['kind'] = 'info') {
  const msg = { id: ++seq, text, kind };
  listeners.forEach((l) => l(msg));
}
export const toastError = (text: string) => toast(text, 'error');

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (t: ToastMsg) => {
      setItems((cur) => [...cur.slice(-2), t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6500 : 2600);
    };
    listeners.push(on);
    return () => { listeners = listeners.filter((l) => l !== on); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3 safe-t" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
            t.kind === 'error' ? 'bg-ink text-white' : 'bg-paper text-ink border border-line'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
