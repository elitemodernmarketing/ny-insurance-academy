/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Deploy under a sub-path with e.g. `VITE_BASE=/fa/ npm run build` (default: served from the site root).
const BASE = (process.env.VITE_BASE ?? '/').replace(/\/?$/, '/');

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'NY Insurance Licensing Academy',
        short_name: 'NY Ins Academy',
        description: 'Offline study app for the New York Life, Accident & Health (17-55) and Personal Lines (17-54) licensing exams',
        theme_color: '#1e3a8a',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src'), '@content': path.resolve(__dirname, 'content') },
  },
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/content/') && id.endsWith('.json')) return 'content';
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory')) return 'charts';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
