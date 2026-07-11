/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MedLingo',
        short_name: 'MedLingo',
        description: 'Medical Hebrew for clinicians',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // e2e/ holds Playwright specs (run via `npm run test:e2e`), not Vitest specs —
    // without this, Vitest's default *.spec.ts glob also picks up e2e/pilot.spec.ts
    // and fails to import Playwright's test() outside a Playwright runner.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
