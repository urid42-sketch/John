import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { he } from '../i18n/he';
import { IconBack } from './icons';

/** Full-screen sub page with a back button (no bottom navigation). */
export function Page({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col bg-cream">
      <header className="safe-t flex items-center gap-2 px-2 py-2">
        <button className="flex h-12 w-12 items-center justify-center" onClick={() => nav(-1)} aria-label={he.common.back}>
          <IconBack />
        </button>
        <h1 className="flex-1 truncate font-serif text-xl">{title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="safe-b p-4">{footer}</div>}
    </div>
  );
}
