// vite.config.ts
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// 本体 JS を「めったに変わらないもの」ごとに分ける（2026-11-16）。
// /assets は1年のキャッシュなので、中身が変わらないファイルは新しい版が出ても取り直されない。
// 1つにまとめていた間は、教材を1つ足しただけでも全部（圧縮後 約440KB）を取り直していた。
// 決まり：ここで分けるものは「ほかの自作コードを読み込まないもの」だけにする。
// 読み込む相手の名前（ハッシュ）が中に入るので、相手が変わると自分の名前も変わってしまうため。
function stableChunk(id: string): string | undefined {
  const p = id.replace(/\\/g, '/');
  if (p.includes('/node_modules/')) {
    if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)\//.test(p)) return 'vendor-react';
    if (/\/node_modules\/(@supabase\/[^/]+|iceberg-js|tslib)\//.test(p)) return 'vendor-supabase';
    return undefined;
  }
  // 単語データ（qid の正本から作る。語を直したときだけ変わる）
  if (p.endsWith('/src/data/kobunQ.v2.slim.json') || p.endsWith('/src/data/vocabIndex.json')) return 'data-vocab';
  // 先生の台詞・あいさつ・昇進の言葉・人物解説（文章だけ）
  if (/\/src\/lib\/(teachers|teacherLines|teacherGreetings|teacherPromotions|teacherProfiles)\.ts$/.test(p)) return 'teacher-text';
  return undefined;
}

// App（単語のホームとクイズ）は遅延ロードなので、そのままだと「入口の JS を読む → App の部品を取りに行く」の2段になる。
// トップ（/）を開いたときだけ、HTML を読んだ時点で App の部品を取り始めるよう、小さなスクリプトを HTML に入れる。
// 教材や文法のページを直接開いたときは何もしない（単語データを読まない）。
function preloadHomeChunks(): Plugin {
  return {
    name: 'kobun-preload-home-chunks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const app = Object.values(bundle).find(
          (c) => c.type === 'chunk' && (c.facadeModuleId ?? '').replace(/\\/g, '/').endsWith('/src/App.tsx'),
        );
        if (!app) return html;
        const seen = new Set<string>();
        const walk = (name: string) => {
          if (seen.has(name)) return;
          seen.add(name);
          const c = bundle[name];
          if (c && c.type === 'chunk') c.imports.forEach(walk);
        };
        walk(app.fileName);
        // HTML がもう読み込んでいるもの（入口とライブラリ）は除く
        const files = [...seen].filter((f) => f.endsWith('.js') && !html.includes(f));
        if (files.length === 0) return html;
        const code =
          `if(location.pathname==='/'){${JSON.stringify(files)}.forEach(function(f){` +
          `var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href='/'+f;document.head.appendChild(l)})}`;
        // 文字コードの宣言のすぐ後ろに入れる（スタイルシートの後ろに置くと、CSS が届くまで実行されない）
        const charset = /<meta charset=[^>]*>/i.exec(html);
        if (!charset) return html;
        const at = charset.index + charset[0].length;
        return html.slice(0, at) + '\n    <script>' + code + '</script>' + html.slice(at);
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .env / Vercel の Environment Variables を読み込む
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      preloadHomeChunks(),
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
    // 大きな JSON（単語データなど）は文字列のまま入れて JSON.parse で読む（JS として読むより速い）。
    // そのかわり JSON からの名前つき import は使えない（default だけ）。
    json: { stringify: true },
    build: {
      outDir: 'dist',
      target: 'es2019',
      sourcemap: true,
      rollupOptions: {
        output: { manualChunks: stableChunk },
      },
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
