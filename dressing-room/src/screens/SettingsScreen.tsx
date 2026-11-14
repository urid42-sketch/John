import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { setAiPin } from '../ai/client';
import { shareImage } from '../canvas/exportLook';
import { BackupError, exportBackup, importBackup, lastBackupAt } from '../db/backup';
import { formatBytes, requestPersist, storageInfo } from '../db/storage';
import { he } from '../i18n/he';
import { errorText } from '../ui/errors';
import { IconBack } from '../ui/icons';
import { Page } from '../ui/Page';
import { toast, toastError } from '../ui/toast';

const t = he.backup;

export function SettingsScreen() {
  const [info, setInfo] = useState<{ persisted: boolean; usage: number; quota: number } | null>(null);
  const [last, setLast] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState<{ label: string; ratio: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => {
    void requestPersist().then(storageInfo).then(setInfo);
    void lastBackupAt().then(setLast).catch(() => setLast(null));
  };
  useEffect(refresh, []);

  const backup = async () => {
    setBusy({ label: t.working, ratio: 0 });
    try {
      const { blob, name, counts } = await exportBackup((ratio) => setBusy({ label: t.working, ratio }));
      await shareImage(new File([blob], name, { type: 'application/zip' }), name.replace(/\.zip$/, ''));
      toast(t.done(counts));
      refresh();
    } catch (e) { console.error(e); toastError(errorText(e)); }
    finally { setBusy(null); }
  };
  const restore = async (file: File | undefined) => {
    if (!file || !confirm(t.confirm)) return;
    setBusy({ label: t.restoring, ratio: 0 });
    try {
      const counts = await importBackup(file, (ratio) => setBusy({ label: t.restoring, ratio }));
      toast(t.restored(counts));
      refresh();
    } catch (e) {
      console.error(e);
      toastError(e instanceof BackupError ? t.errors[e.code] : errorText(e));
    } finally { setBusy(null); }
  };

  return (
    <Page title={he.settings.title}>
      <div className="space-y-4 p-4">
        <Link to="/dolls" className="flex min-h-14 items-center justify-between rounded-3xl border border-line bg-paper px-5">
          <span>{he.settings.dolls}</span>
          <span className="rotate-180 text-muted"><IconBack /></span>
        </Link>

        <section className="space-y-3 rounded-3xl border border-line bg-paper p-5">
          <h2 className="font-serif text-lg">{t.title}</h2>
          <p className="text-sm leading-relaxed text-muted">{t.hint}</p>
          {last !== undefined && (
            <p className="text-sm text-muted">{last ? t.last(new Date(last).toLocaleDateString('he-IL')) : t.never}</p>
          )}
          <input ref={fileRef} type="file" accept=".zip,application/zip" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void restore(f); }} />
          {busy ? (
            <div role="status" className="space-y-2">
              <p className="text-sm">{busy.label}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-rose-soft" dir="ltr">
                <div className="h-full bg-rose" style={{ width: `${Math.round(busy.ratio * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary w-full" onClick={() => void backup()}>{t.export}</button>
              <button className="btn btn-ghost w-full" onClick={() => fileRef.current?.click()}>{t.import}</button>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-paper p-5">
          <h2 className="mb-2 font-serif text-lg">{he.settings.storage}</h2>
          {info && (
            <div className="space-y-1 text-sm text-muted">
              <p>{info.persisted ? he.settings.persisted : he.settings.notPersisted}</p>
              {info.quota > 0 && <p>{he.settings.usage(formatBytes(info.usage), formatBytes(info.quota))}</p>}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-paper p-5">
          <h2 className="mb-2 font-serif text-lg">{he.settings.installTitle}</h2>
          <p className="text-sm leading-relaxed text-muted">{he.settings.installBody}</p>
          <p className="mt-2 text-sm leading-relaxed text-rose-deep">{he.settings.installWarn}</p>
        </section>

        <section className="space-y-2 rounded-3xl border border-line bg-paper p-5">
          <h2 className="font-serif text-lg">{he.ai.settingsTitle}</h2>
          <p className="text-sm leading-relaxed text-muted">{he.ai.consentBody}</p>
          <button className="min-h-11 text-sm text-rose-deep underline" onClick={() => { setAiPin(null); toast(he.ai.pinReset); }}>{he.ai.resetPin}</button>
        </section>
        <p className="text-center text-xs text-muted">{he.welcome.privacy}</p>
      </div>
    </Page>
  );
}
