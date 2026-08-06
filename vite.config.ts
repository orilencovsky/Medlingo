/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults } from 'vitest/config';

// The first thing the app does is talk to Supabase (session + profile).
// Opening the connection while the JS is still downloading takes the
// DNS + TCP + TLS handshake off the critical path of that first query.
function preconnectSupabase(mode: string): PluginOption {
  const env = loadEnv(mode, process.cwd(), '');
  if (!env.VITE_SUPABASE_URL) return false;
  const origin = new URL(env.VITE_SUPABASE_URL).origin;
  return {
    name: 'medlingo:preconnect-supabase',
    transformIndexHtml() {
      return [
        // crossorigin: supabase-js sends Authorization-header CORS requests
        // without credentials, which reuse only anonymous-mode connections.
        { tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head' },
      ];
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    preconnectSupabase(mode),
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
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor code gets stable chunk hashes, so a routine app
        // deploy only re-downloads the (small) chunks that actually changed.
        // '$initial' keeps the catch-all group scoped to startup code; deps
        // used only by lazily-loaded pages stay in those pages' chunks.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor', test: /node_modules/, tags: ['$initial'] },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // e2e/ holds Playwright specs (run via `npm run test:e2e`), not Vitest specs —
    // without this, Vitest's default *.spec.ts glob also picks up e2e/pilot.spec.ts
    // and fails to import Playwright's test() outside a Playwright runner.
    // supabase/functions/ holds Deno Edge Function specs (run via `deno test`) — they use
    // jsr:/npm: specifiers and the Deno.test global that Vitest/Node can't resolve.
    exclude: [...configDefaults.exclude, 'e2e/**', 'supabase/functions/**'],
  },
}));
