import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, isPreview }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  base: command === 'build' || isPreview ? '/dune-imperium-timer/' : '/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false, // pwa.ts owns registration and explicit update consent.
      scope: '/dune-imperium-timer/',
      includeManifestIcons: false,
      manifest: {
        id: '/dune-imperium-timer/',
        start_url: '/dune-imperium-timer/',
        scope: '/dune-imperium-timer/',
        name: 'Dune Imperium Timer',
        short_name: 'Dune Timer',
        lang: 'ru',
        description: 'Личные часы, герои и история партий в Дюну: Империю',
        display: 'standalone',
        theme_color: '#f4eddf',
        background_color: '#f4eddf',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'dune-imperium-timer',
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/dune-imperium-timer(?:\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
}));
