import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/scichart/_wasm/*',
          dest: ''
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
});
