import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/frank-ruhl-libre/500.css';
import './index.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

// Offline support / install to home screen. Production only, so dev never serves stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

// After a deploy the old lazy chunks are gone; reload once to pick up the new version.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('reloaded-for-update')) return;
  sessionStorage.setItem('reloaded-for-update', '1');
  location.reload();
});

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
