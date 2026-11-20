import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import PullToRefresh from './components/PullToRefresh.tsx'
import RequireAccount from './components/RequireAccount.tsx'
import { ensureAnonSession } from './lib/anonAuth.ts'
import { captureGuestParam } from './lib/guest.ts'
import { applyUnlockFromUrl } from './lib/fullAccess.ts'
import { applyCohortFromUrl } from './lib/cohort.ts'
import { ReiwaThemeProvider } from './theme/ThemeContext'
import './index.css'

// `?unlock=<合言葉>` を消費して localStorage フラグに変換する。
// React マウント前に処理して、ページ初描画から反映させる。
applyUnlockFromUrl()
// `?cohort=<コホート名>` を消費して localStorage に保存。学年・学校別教材セットの選択。
applyCohortFromUrl()

// 単語のホームとクイズ（App）も遅延ロードにする（2026-11-16）。
// 教材や文法のページを直接開いたときに、単語データ（約720KB）まで読まなくて済む。
// トップを開いたときは、下の「先に取り始める」で待ちを増やさない。
const loadApp = () => import('./App.tsx')
if (window.location.pathname === '/') void loadApp().catch(() => {})
const App = lazy(loadApp)
const TestGrading = lazy(() => import('./TestGrading.tsx').then((m) => ({ default: m.TestGrading })))

// 新しい版が出たあと、開いたままの画面が古い名前の部品を取りに行くと 404 になる（画面が出ない）。
// そのときは1回だけページを読み直して新しい版にする。続けては読み直さない（1分に1回まで）。
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'kobun.chunkReloadAt'
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

// 読解 v3 と、単語アプリから動線が遠いページは遅延ロード
const HomeV3 = lazy(() => import('./pages/HomeV3.tsx'))
const TextReader = lazy(() => import('./pages/TextReader.tsx'))
const TextGuide = lazy(() => import('./pages/TextGuide.tsx'))
const TextPrint = lazy(() => import('./pages/TextPrint.tsx'))
const ReadingTest = lazy(() => import('./pages/ReadingTest.tsx'))
const ReferenceHome = lazy(() => import('./pages/ReferenceHome.tsx'))
const ReferenceTopic = lazy(() => import('./pages/ReferenceTopic.tsx'))
const AffixList = lazy(() => import('./pages/AffixList.tsx'))
const KanniTable = lazy(() => import('./pages/KanniTable.tsx'))
const GardenPage = lazy(() => import('./pages/GardenPage.tsx'))
const GrammarDojoHome = lazy(() => import('./pages/GrammarDojoHome.tsx'))
const Manabinaoshi = lazy(() => import('./pages/Manabinaoshi.tsx'))
const VocabDojoHome = lazy(() => import('./pages/VocabDojoHome.tsx'))
const GrammarDojoReview = lazy(() => import('./pages/GrammarDojoReview.tsx'))
const GrammarDojoTopic = lazy(() => import('./pages/GrammarDojoTopic.tsx'))
const ReibunDict = lazy(() => import('./pages/ReibunDict.tsx'))
const ReibunQuiz = lazy(() => import('./pages/ReibunQuiz.tsx'))
const VocabPage = lazy(() => import('./pages/VocabPage.tsx'))
const VocabCard = lazy(() => import('./pages/VocabCard.tsx'))
const VocabHome = lazy(() => import('./pages/VocabHome.tsx'))
const AccountPage = lazy(() => import('./pages/AccountPage.tsx'))
const GuestLogin = lazy(() => import('./pages/GuestLogin.tsx'))
const AuthCallback = lazy(() => import('./pages/AuthCallback.tsx'))
const Teacher = lazy(() => import('./pages/Teacher.tsx'))
const TextDetail = lazy(() => import('./pages/TextDetail.tsx'))
const TextsIndex = lazy(() => import('./pages/TextsIndex.tsx'))
const SearchPage = lazy(() => import('./pages/SearchPage.tsx'))
const StatsPage = lazy(() => import('./pages/StatsPage.tsx'))

// Supabase Anonymous Sign-in を起動時に一度だけ発火する。
// RLS が auth.uid ベースに締まっているので、学習記録系の書き込み前に
// セッション確立を済ませておく。失敗しても起動は続行（フォールバックあり）。
// お試しのアドレス（?guest=1）なら、まだゲストでない端末をパスワードの画面（/guest）へ。?guest=0 は印を外す（lib/guest.ts）
{
  const to = captureGuestParam()
  if (to) window.history.replaceState(null, '', to)
}
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
      <Suspense fallback={<Fallback />}>
        {/* 初回起動時の登録ガード（/account・/auth/callback・/teacher・/test-grading は対象外） */}
        <RequireAccount>
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
          <Route path="/read/texts/:textId/print" element={<TextPrint />} />
          <Route path="/read/texts/:textId/test" element={<ReadingTest />} />
          <Route path="/read/reference" element={<ReferenceHome />} />
          <Route path="/read/reference/:topicId" element={<ReferenceTopic />} />
          <Route path="/read/affixes" element={<AffixList />} />
          <Route path="/kanni" element={<KanniTable />} />
          <Route path="/garden" element={<GardenPage />} />
          <Route path="/read/grammar" element={<GrammarDojoHome />} />
          <Route path="/manabinaoshi" element={<Manabinaoshi />} />
          <Route path="/tango-dojo" element={<VocabDojoHome />} />
          <Route path="/vocab" element={<VocabHome />} />
          <Route path="/word/:lemma" element={<VocabCard />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/guest" element={<GuestLogin />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/read/grammar/reibun" element={<ReibunDict />} />
          <Route path="/read/grammar/reibun/quiz" element={<ReibunQuiz />} />
          <Route path="/read/grammar/review" element={<GrammarDojoReview />} />
          <Route path="/read/grammar/:topicId" element={<GrammarDojoTopic />} />
          <Route path="/read/vocab" element={<VocabPage />} />
        </Routes>
        </RequireAccount>
      </Suspense>
      </ReiwaThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
