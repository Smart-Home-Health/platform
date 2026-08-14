import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ command }) => ({
  // Production build uses relative asset URLs ('./assets/...') so the injected
  // <base href> (set to the Home Assistant ingress prefix at serve time) governs
  // where they load from. Dev server stays at root ('/') — no ingress there.
  base: command === 'build' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/scichart/_wasm/*',
          dest: ''
        },
        // Tesseract.js OCR assets, vendored so packing-slip scanning works
        // fully offline / same-origin (HA add-on + LAN installs; no CDN).
        // The worker picks a core variant via SIMD feature detection, so all
        // three lstm variants must be present. Language data lives in
        // public/tessdata/lang/ (eng.traineddata.gz, tessdata_fast).
        {
          src: 'node_modules/tesseract.js/dist/worker.min.js',
          dest: 'tessdata'
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core*lstm*',
          dest: 'tessdata/core'
        }
      ]
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Split-dev only: the app now uses same-origin URLs (see src/config.js), so the
  // Vite dev server proxies API + WebSocket traffic to the backend. In the dev
  // container set VITE_PROXY_TARGET=http://backend:8000; on the host it defaults
  // to localhost:8000. The unified production image doesn't use Vite at all.
  server: {
    host: '0.0.0.0',
    proxy: {
      // ws:true so the reader-pairing WebSocket (/api/readers/ws/:id) upgrades
      // through the proxy too — a paired reader connects to the browser's origin
      // (:5173 in dev), and Vite forwards it to the backend. Plain /api HTTP is
      // unaffected.
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
}));
