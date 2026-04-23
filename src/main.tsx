import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

// 新 kobun-v3 風 UI
import HomeV3 from './pages/HomeV3.tsx'
import TextReader from './pages/TextReader.tsx'
import TextGuide from './pages/TextGuide.tsx'
import ReferenceHome from './pages/ReferenceHome.tsx'
import ReferenceTopic from './pages/ReferenceTopic.tsx'
import VocabPage from './pages/VocabPage.tsx'

// 旧クイズ系は /quiz 配下へ退避
import App from './App.tsx'
import { TestGrading } from './TestGrading.tsx'
import Teacher from './pages/Teacher.tsx'
import TextDetail from './pages/TextDetail.tsx'
import TextsIndex from './pages/TextsIndex.tsx'
import SearchPage from './pages/SearchPage.tsx'
import PWAInstallBanner from './components/PWAInstallBanner.tsx'
import PullToRefresh from './components/PullToRefresh.tsx'
import { ensureAnonSession } from './lib/anonAuth.ts'
import './index.css'

// Supabase Anonymous Sign-in を起動時に一度だけ発火する。
// RLS が auth.uid ベースに締まっているので、学習記録系の書き込み前に
// セッション確立を済ませておく。失敗しても起動は続行（フォールバックあり）。
void ensureAnonSession().catch(() => {})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PullToRefresh />
      <PWAInstallBanner />
      <Routes>
        {/* 新 UI（kobun-v3 形式） */}
        <Route path="/" element={<HomeV3 />} />
        <Route path="/texts/:textId" element={<TextReader />} />
        <Route path="/texts/:textId/guide" element={<TextGuide />} />
        <Route path="/reference" element={<ReferenceHome />} />
        <Route path="/reference/:topicId" element={<ReferenceTopic />} />
        <Route path="/vocab" element={<VocabPage />} />

        {/* 旧クイズ機能（/quiz 配下に退避） */}
        <Route path="/quiz" element={<App />} />
        <Route path="/quiz/test-grading" element={<TestGrading />} />
        <Route path="/quiz/teacher" element={<Teacher />} />
        <Route path="/quiz/texts" element={<TextsIndex />} />
        <Route path="/quiz/texts/:id" element={<TextDetail />} />
        <Route path="/quiz/search" element={<SearchPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
