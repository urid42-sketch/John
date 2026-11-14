import { useEffect, useState } from 'react';
import { Link, Outlet, Route, Routes } from 'react-router-dom';
import { lastBackupAt } from './db/backup';
import { db } from './db/schema';
import { he } from './i18n/he';
import { ImportFlow } from './import/ImportFlow';
import { DollCalibrate } from './screens/DollCalibrate';
import { DollsScreen } from './screens/DollsScreen';
import { StudioEditor } from './studio/StudioEditor';
import { StudioHome } from './studio/StudioHome';
import { GarmentScreen } from './screens/GarmentScreen';
import { RasterEditor } from './screens/RasterEditor';
import { SettingsScreen } from './screens/SettingsScreen';
import { HelpScreen } from './screens/HelpScreen';
import { LooksScreen } from './screens/LooksScreen';
import { TryOnScreen } from './screens/TryOnScreen';
import { WardrobeScreen } from './screens/WardrobeScreen';
import { BottomNav } from './ui/BottomNav';
import { IconGear, IconHelp } from './ui/icons';
import { toast, ToastHost } from './ui/toast';

function Shell() {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      <header className="safe-t flex items-center justify-between px-4 pb-1 pt-2">
        <h1 className="font-serif text-2xl tracking-wide">{he.appName}</h1>
        <div className="flex">
          <Link to="/help" aria-label={he.guide.help} className="flex h-12 w-11 items-center justify-center text-muted"><IconHelp /></Link>
          <Link to="/settings" aria-label={he.settings.title} className="flex h-12 w-11 items-center justify-center text-muted"><IconGear /></Link>
        </div>
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
    db.open()
      .then(async () => {
        // Gentle nudge: plenty of content and no backup for two weeks.
        const [last, count, oldest] = await Promise.all([lastBackupAt(), db.garments.count(), db.garments.orderBy('updatedAt').first()]);
        const since = last ?? oldest?.createdAt ?? Date.now(); // a brand-new wardrobe needs no nagging
        if (count >= 5 && Date.now() - since > 14 * 86400_000) toast(he.backup.reminder);
      })
      .catch((e) => { console.error(e); setDbError(true); });
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
          <Route path="studio" element={<StudioHome />} />
          <Route path="looks" element={<LooksScreen />} />
        </Route>
        <Route path="import/:kind" element={<div className="mx-auto h-full max-w-xl"><ImportFlow /></div>} />
        <Route path="garment/:id" element={<GarmentScreen />} />
        <Route path="garment/:id/edit" element={<RasterEditor />} />
        <Route path="studio/new/:template" element={<StudioEditor />} />
        <Route path="studio/edit/:id" element={<StudioEditor key="edit" />} />
        <Route path="dolls" element={<DollsScreen />} />
        <Route path="dolls/:id/calibrate" element={<DollCalibrate />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="help" element={<HelpScreen />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </>
  );
}
