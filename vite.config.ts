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
        // 学校ネットワーク (Cisco Umbrella SWG 等) 環境下で Service Worker の
        // importScripts が SSO 認証壁にリダイレクトされて PWA 全体が壊れる
        // 問題を回避するため、Service Worker を廃止。
        //
        // selfDestroying: 既にユーザー端末に登録済みの SW を強制 unregister
        // + caches を全消去する特殊 SW を発行する。ユーザーが一度でも新版を
        // 読み込めば自動的に SW なし状態に移行する。将来的には本設定自体を
        // 削除してよい（今は旧 SW を持つ端末のクリーンアップ期間）。
        selfDestroying: true,
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: [],
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
