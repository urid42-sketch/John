import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { deleteDoll, setDefaultDoll } from '../db/repo';
import { db } from '../db/schema';
import { he } from '../i18n/he';
import { errorText } from '../ui/errors';
import { IconPlus, IconTrash } from '../ui/icons';
import { Page } from '../ui/Page';
import { Thumb } from '../ui/Thumb';
import { toastError } from '../ui/toast';

export function DollsScreen() {
  const dolls = useLiveQuery(() => db.dolls.orderBy('createdAt').toArray(), []);
  const guard = (fn: () => Promise<void>) => () => { fn().catch((e) => toastError(errorText(e))); };
  return (
    <Page
      title={he.dolls.title}
      footer={<Link to="/import/doll" className="btn btn-primary w-full"><IconPlus />{he.dolls.add}</Link>}
    >
      {dolls?.length === 0 && <p className="p-8 text-center text-muted">{he.dolls.empty}</p>}
      <ul className="grid grid-cols-2 gap-3 p-4">
        {dolls?.map((d) => (
          <li key={d.id} className={`rounded-3xl border bg-paper p-3 ${d.isDefault ? 'border-rose' : 'border-line'}`}>
            <div className="aspect-[3/5]"><Thumb blob={d.thumb} alt={d.name} /></div>
            <p className="mt-2 truncate text-center text-sm">{d.name}</p>
            <div className="mt-2 flex items-center gap-1">
              {d.isDefault ? (
                <span className="flex min-h-11 flex-1 items-center justify-center text-sm text-rose-deep">{he.dolls.isDefault}</span>
              ) : (
                <button className="min-h-11 flex-1 text-sm underline" onClick={guard(() => setDefaultDoll(d.id))}>
                  {he.dolls.setDefault}
                </button>
              )}
              <button
                className="flex h-11 w-11 items-center justify-center text-muted" aria-label={he.common.delete}
                onClick={guard(async () => { if (confirm(he.dolls.deleteConfirm)) await deleteDoll(d.id); })}
              >
                <IconTrash />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Page>
  );
}
