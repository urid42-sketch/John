import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Emits /sw.js with the list of built files to precache (everything except the huge wasm). */
function serviceWorker(): Plugin {
  return {
    name: 'dressing-room-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .filter((f) => !f.fileName.endsWith('.wasm') && !f.fileName.endsWith('.map') && !/ort[.-]/.test(f.fileName))
        .map((f) => `/${f.fileName}`);
      const list = ['/', '/index.html', '/manifest.webmanifest', '/closet.svg', '/icons/icon-192.png', ...assets];
      const source = readFileSync(new URL('./src/sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', Date.now().toString(36))
        .replace('__ASSETS__', JSON.stringify([...new Set(list)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: { host: true },
  test: { environment: 'node' },
} as never);
