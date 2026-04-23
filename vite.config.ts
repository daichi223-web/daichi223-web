// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .env / Vercel の Environment Variables を読み込む
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,ico,png,svg}', 'index.html'],
          globIgnores: [
            'vocab/**/*.html',
            'vocab/**/*.json',
            'texts/**/*.json',
            'examples*.json',
          ],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/vocab/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'vocab-cache',
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/texts/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'texts-cache',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /\/(examples|examples-by-lemma)\.json$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'examples-cache',
                expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
        },
        manifest: {
          name: '古文単語学習アプリ',
          short_name: '古文たん',
          description: '古文単語と多義語の学習を支援するアプリケーション',
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#3b82f6',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        'path': 'path-browserify',
      },
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    },
    build: {
      outDir: 'dist',
      target: 'es2019',
      sourcemap: true,
    },
    define: {
      // 一部ライブラリが参照する場合の対策
      'process.env': {},
      // 任意：アプリバージョンを埋め込む
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    server: {
      port: 3000,
      open: false,
    },
  };
});
