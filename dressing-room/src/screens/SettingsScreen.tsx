import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes, requestPersist, storageInfo } from '../db/storage';
import { he } from '../i18n/he';
import { IconBack } from '../ui/icons';
import { Page } from '../ui/Page';

export function SettingsScreen() {
  const [info, setInfo] = useState<{ persisted: boolean; usage: number; quota: number } | null>(null);
  useEffect(() => {
    void requestPersist().then(storageInfo).then(setInfo);
  }, []);
  return (
    <Page title={he.settings.title}>
      <div className="space-y-4 p-4">
        <Link to="/dolls" className="flex min-h-14 items-center justify-between rounded-3xl border border-line bg-paper px-5">
          <span>{he.settings.dolls}</span>
          <span className="rotate-180 text-muted"><IconBack /></span>
        </Link>
        <section className="rounded-3xl border border-line bg-paper p-5">
          <h2 className="mb-2 font-serif text-lg">{he.settings.storage}</h2>
          {info && (
            <div className="space-y-1 text-sm text-muted">
              <p>{info.persisted ? he.settings.persisted : he.settings.notPersisted}</p>
              {info.quota > 0 && <p>{he.settings.usage(formatBytes(info.usage), formatBytes(info.quota))}</p>}
            </div>
          )}
          <p className="mt-2 text-sm text-muted">{he.settings.backupSoon}</p>
        </section>
        <section className="rounded-3xl border border-line bg-paper p-5">
          <h2 className="mb-2 font-serif text-lg">{he.settings.installTitle}</h2>
          <p className="text-sm leading-relaxed text-muted">{he.settings.installBody}</p>
          <p className="mt-2 text-sm leading-relaxed text-rose-deep">{he.settings.installWarn}</p>
        </section>
        <p className="text-center text-xs text-muted">{he.welcome.privacy}</p>
      </div>
    </Page>
  );
}
