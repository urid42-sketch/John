import { useEffect, useState } from 'react';
import { Link, Outlet, Route, Routes } from 'react-router-dom';
import { db } from './db/schema';
import { he } from './i18n/he';
import { ImportFlow } from './import/ImportFlow';
import { DollsScreen } from './screens/DollsScreen';
import { GarmentScreen } from './screens/GarmentScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SoonScreen } from './screens/SoonScreen';
import { TryOnScreen } from './screens/TryOnScreen';
import { WardrobeScreen } from './screens/WardrobeScreen';
import { BottomNav } from './ui/BottomNav';
import { IconGear } from './ui/icons';
import { ToastHost } from './ui/toast';

function Shell() {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      <header className="safe-t flex items-center justify-between px-4 pb-1 pt-2">
        <h1 className="font-serif text-2xl tracking-wide">{he.appName}</h1>
        <Link to="/settings" aria-label={he.settings.title} className="flex h-12 w-12 items-center justify-center text-muted">
          <IconGear />
        </Link>
      </header>
      <main className="relative min-h-0 flex-1">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export function App() {
  const [dbError, setDbError] = useState(false);
  useEffect(() => {
    db.open().catch((e) => { console.error(e); setDbError(true); });
  }, []);
  if (dbError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
        <h1 className="font-serif text-2xl">{he.appName}</h1>
        <p className="max-w-xs leading-relaxed text-muted">{he.errors.dbFailed}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>{he.common.retry}</button>
      </div>
    );
  }
  return (
    <>
      <ToastHost />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<TryOnScreen />} />
          <Route path="wardrobe" element={<WardrobeScreen />} />
          <Route path="studio" element={<SoonScreen title={he.soon.studio} body={he.soon.studioBody} />} />
          <Route path="looks" element={<SoonScreen title={he.soon.looks} body={he.soon.looksBody} />} />
        </Route>
        <Route path="import/:kind" element={<div className="mx-auto h-full max-w-xl"><ImportFlow /></div>} />
        <Route path="garment/:id" element={<GarmentScreen />} />
        <Route path="dolls" element={<DollsScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </>
  );
}
