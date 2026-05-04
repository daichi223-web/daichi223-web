import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

// 単語クイズ本体（初回ロードでほぼ確実に必要なので eager）
import App from './App.tsx'
import { TestGrading } from './TestGrading.tsx'
import PWAInstallBanner from './components/PWAInstallBanner.tsx'
import PullToRefresh from './components/PullToRefresh.tsx'
import { ensureAnonSession } from './lib/anonAuth.ts'
import { applyUnlockFromUrl } from './lib/fullAccess.ts'
import { ReiwaThemeProvider } from './theme/ThemeContext'
import './index.css'

// `?unlock=<合言葉>` を消費して localStorage フラグに変換する。
// React マウント前に処理して、ページ初描画から反映させる。
applyUnlockFromUrl()

// 読解 v3 と、単語アプリから動線が遠いページは遅延ロード
const HomeV3 = lazy(() => import('./pages/HomeV3.tsx'))
const TextReader = lazy(() => import('./pages/TextReader.tsx'))
const TextGuide = lazy(() => import('./pages/TextGuide.tsx'))
const ReferenceHome = lazy(() => import('./pages/ReferenceHome.tsx'))
const ReferenceTopic = lazy(() => import('./pages/ReferenceTopic.tsx'))
const VocabPage = lazy(() => import('./pages/VocabPage.tsx'))
const Teacher = lazy(() => import('./pages/Teacher.tsx'))
const TextDetail = lazy(() => import('./pages/TextDetail.tsx'))
const TextsIndex = lazy(() => import('./pages/TextsIndex.tsx'))
const SearchPage = lazy(() => import('./pages/SearchPage.tsx'))
const StatsPage = lazy(() => import('./pages/StatsPage.tsx'))

// Supabase Anonymous Sign-in を起動時に一度だけ発火する。
// RLS が auth.uid ベースに締まっているので、学習記録系の書き込み前に
// セッション確立を済ませておく。失敗しても起動は続行（フォールバックあり）。
void ensureAnonSession().catch(() => {})

function Fallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <p className="text-scaffold">読み込み中…</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ReiwaThemeProvider>
      <PullToRefresh />
      <PWAInstallBanner />
      <Suspense fallback={<Fallback />}>
        <Routes>
          {/* 単語クイズ（ルート） */}
          <Route path="/" element={<App />} />
          <Route path="/test-grading" element={<TestGrading />} />
          <Route path="/teacher" element={<Teacher />} />
          <Route path="/texts" element={<TextsIndex />} />
          <Route path="/texts/:id" element={<TextDetail />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/stats" element={<StatsPage />} />

          {/* 読解 v3（/read 配下） */}
          <Route path="/read" element={<HomeV3 />} />
          <Route path="/read/texts/:textId" element={<TextReader />} />
          <Route path="/read/texts/:textId/guide" element={<TextGuide />} />
          <Route path="/read/reference" element={<ReferenceHome />} />
          <Route path="/read/reference/:topicId" element={<ReferenceTopic />} />
          <Route path="/read/vocab" element={<VocabPage />} />
        </Routes>
      </Suspense>
      </ReiwaThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
