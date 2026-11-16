/**
 * 単語クイズ・多義語クイズの結果画面（2026-11-16 に src/App.tsx から切り出した。見た目と文言はそのまま）。
 * 状態は持たない。何が起きるかは親（App）が決め、ここは表示とボタンだけ。
 */
import type { ReactNode } from 'react';
import { returnLabels } from '@/lib/returnTo';
import { nextRangeLabel } from '@/lib/quiz/nextRange';

type Props = {
  /** 画面右上の固定ボタン（ホーム・テーマ・検索・索引など。親が作る） */
  header: ReactNode;
  score: number;
  /** 採点の分母 */
  totalScore: number;
  currentMode: 'word' | 'polysemy';
  quizMode: 'normal' | 'weak' | 'srs' | 'focus' | 'today';
  /** 今日の分の成長1行（無ければ出さない） */
  todayGrowth: string | null;
  /** 単語モードの範囲が 1〜330 の全部か（単語王の判定） */
  wordRangeIsAll: boolean;
  /** 多義語モードの範囲が 1〜330 の全部か（単語最強王の判定） */
  polysemyRangeIsAll: boolean;
  wrongAnswers: Array<{ lemma: string; sense: string; qid: string }>;
  cumulativeStats: { totalAnswered: number; totalCorrect: number; masteredCount: number };
  /** 教材・単語カードから来たときの戻り先 */
  returnTo: string | null;
  /** 「次の範囲へ」の行き先（無ければボタンを出さない） */
  nextRangeForEnd: { from: number; to: number } | null;
  /** その語に詳しい解説（単語帳）があるか */
  hasExplanation: (lemma: string) => boolean;
  /** 間違えた語（全部／1語）だけでクイズを始める */
  onReview: (qids: string[]) => void;
  onOpenVocab: (lemma: string) => void;
  onGoHome: () => void;
  /** 今日の分をもう1セット */
  onAnotherSet: () => void;
  onNextRange: (next: { from: number; to: number }) => void;
  onRestart: () => void;
  onNavigate: (path: string) => void;
};

export function QuizResultScreen({
  header,
  score,
  totalScore,
  currentMode,
  quizMode,
  todayGrowth,
  wordRangeIsAll,
  polysemyRangeIsAll,
  wrongAnswers,
  cumulativeStats,
  returnTo,
  nextRangeForEnd,
  hasExplanation,
  onReview,
  onOpenVocab,
  onGoHome,
  onAnotherSet,
  onNextRange,
  onRestart,
  onNavigate,
}: Props) {
  const percent = totalScore > 0 ? Math.round((score / totalScore) * 100) : 0;
  const isPerfectScore = score === totalScore && totalScore > 0;
  const showGinkgoAnimation = isPerfectScore && totalScore >= 20;

  // 単語王：330問完全制覇（範囲1-330）
  const isMasterAchievement = isPerfectScore && totalScore === 330 && wordRangeIsAll;

  // 単語最強王：多義語モード200問完全制覇（範囲1-330。多義語の見出し語数。2026-10-16 に8意味を追加して 196→200）
  const isUltimateMasterAchievement = isPerfectScore && totalScore === 200 && polysemyRangeIsAll;

  return (
    <div className="bg-rw-bg min-h-dvh relative overflow-hidden">
      {header}
      {/* 銀杏の葉アニメーション */}
      {showGinkgoAnimation && (
        <div className="ginkgo-container">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="ginkgo-leaf"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${4 + Math.random() * 2}s`
              }}
            >
              🍂
            </div>
          ))}
          <style>{`
            .ginkgo-container {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
              z-index: 50;
            }
            .ginkgo-leaf {
              position: absolute;
              top: -50px;
              font-size: 2rem;
              animation: fall linear infinite;
            }
            @keyframes fall {
              0% {
                transform: translateY(0) rotate(0deg);
                opacity: 1;
              }
              100% {
                transform: translateY(100vh) rotate(360deg);
                opacity: 0.3;
              }
            }
          `}</style>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 md:px-8 md:py-8 relative z-10 pt-16">
        {/* スコアカード (rw-paper + ink 太枠 + pop 装飾円) */}
        <div className="bg-rw-paper border-2 border-rw-ink rounded-3xl p-6 md:p-8 text-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-rw-pop opacity-40" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-rw-accent opacity-30" />

          <div className="relative">
            {quizMode === 'today' ? (
              <>
                <div className="text-[10px] tracking-[0.2em] font-black text-rw-ink-soft uppercase mb-1">Today's Quest</div>
                <h1 className="text-2xl font-black text-rw-ink mb-2">今日はここまで</h1>
                <p className="text-rw-ink-soft text-sm mb-2">今日の分は終わり。お疲れさま。</p>
                {todayGrowth ? (
                  <p className="text-sm font-black text-rw-accent mb-5">{todayGrowth}</p>
                ) : (
                  <div className="mb-3" />
                )}
              </>
            ) : (
              <>
                <div className="text-[10px] tracking-[0.2em] font-black text-rw-ink-soft uppercase mb-1">Quest Cleared</div>
                <h1 className="text-2xl font-black text-rw-ink mb-2">クイズ終了！</h1>
                <p className="text-rw-ink-soft text-sm mb-5">お疲れ様でした。</p>
              </>
            )}

            {/* Perfect Score Celebration */}
            {isPerfectScore && (
              <div className="mb-5">
                {isUltimateMasterAchievement ? (
                  <>
                    <div className="text-7xl md:text-8xl font-black mb-3 animate-pulse" style={{
                      background: 'linear-gradient(45deg, var(--rw-primary), var(--rw-pop), var(--rw-primary))',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      textShadow: '0 0 30px rgba(255, 0, 0, 0.4)'
                    }}>
                      🔥👑🔥
                    </div>
                    <p className="text-4xl md:text-5xl font-black mb-3 tracking-widest" style={{
                      background: 'linear-gradient(45deg, var(--rw-primary), var(--rw-pop))',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}>
                      単語最強王
                    </p>
                    <p className="text-base font-black text-rw-primary mb-1">全200問完全制覇！</p>
                    <p className="text-sm text-rw-ink-soft">あなたは最強の単語マスターです！</p>
                  </>
                ) : isMasterAchievement ? (
                  <>
                    <div className="text-7xl md:text-8xl font-black mb-3 animate-pulse" style={{
                      background: 'linear-gradient(45deg, var(--rw-pop), #FFA500, var(--rw-pop))',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      textShadow: '0 0 30px rgba(255, 215, 0, 0.4)'
                    }}>
                      👑
                    </div>
                    <p className="text-4xl md:text-5xl font-black mb-3 tracking-widest" style={{
                      background: 'linear-gradient(45deg, var(--rw-pop), #FF8C00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}>
                      単語王
                    </p>
                    <p className="text-base font-black text-rw-pop mb-1">全330問完全制覇！</p>
                    <p className="text-sm text-rw-ink-soft">あなたは真の単語マスターです！</p>
                  </>
                ) : (
                  <>
                    <div className="text-7xl font-black mb-2 animate-bounce" style={{ color: 'var(--rw-accent)' }}>
                      ○
                    </div>
                    <p className="text-lg font-black text-rw-accent mb-1">パーフェクト！</p>
                    <p className="text-sm text-rw-ink-soft">すべて正解です！素晴らしい！</p>
                    {showGinkgoAnimation && (
                      <p className="text-xs text-rw-pop mt-1">🍂 銀杏の葉が舞っています 🍂</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* スコア表示 (大型) */}
            <div className="mb-5">
              <div className="flex items-baseline justify-center gap-1">
                <span
                  className="text-6xl md:text-7xl font-black"
                  style={{
                    color: isPerfectScore
                      ? 'var(--rw-accent)'
                      : percent >= 80
                      ? 'var(--rw-accent)'
                      : percent >= 50
                      ? 'var(--rw-pop)'
                      : 'var(--rw-primary)',
                  }}
                >
                  {score}
                </span>
                <span className="text-2xl font-black text-rw-ink-soft">
                  / {totalScore}
                </span>
              </div>
              <p className="text-sm font-bold text-rw-ink-soft mt-1">正解率 {percent}%</p>
            </div>

            {/* 間違えた単語の復習リスト */}
            {wrongAnswers.length > 0 && (
              <div className="mb-5 text-left">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase">
                    間違えた単語 ({wrongAnswers.length}語)
                  </h3>
                  {wrongAnswers.length > 0 && (
                    <button
                      onClick={() => onReview(wrongAnswers.map((w) => w.qid))}
                      className="text-[11px] font-black px-3 py-1 rounded-full transition-colors"
                      style={{
                        background: 'var(--rw-ink)',
                        color: 'var(--rw-paper)',
                      }}
                      title="間違えた単語だけでクイズを再起動"
                    >
                      全部復習 ▶
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {wrongAnswers.map((w) => {
                    const hasExpl = hasExplanation(w.lemma);
                    return (
                      <div
                        key={w.qid}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm border border-rw-rule"
                        style={{ background: 'var(--rw-primary-soft)' }}
                      >
                        <div className="flex-1 min-w-0 flex items-baseline gap-2">
                          <span className="font-bold text-rw-ink shrink-0">{w.lemma}</span>
                          <span className="text-rw-ink-soft truncate">{w.sense}</span>
                        </div>
                        {hasExpl && (
                          <button
                            onClick={() => onOpenVocab(w.lemma)}
                            className="text-[10px] font-black rounded-full px-2 py-1 shrink-0"
                            style={{
                              background: 'color-mix(in srgb, var(--layer-5) 12%, transparent)',
                              color: 'var(--layer-5)',
                              border: '1px solid color-mix(in srgb, var(--layer-5) 30%, transparent)',
                            }}
                            title={`「${w.lemma}」の詳細解説を開く`}
                          >
                            📖
                          </button>
                        )}
                        <button
                          onClick={() => onReview([w.qid])}
                          className="text-[10px] font-black rounded-full px-2 py-1 shrink-0"
                          style={{
                            background: 'var(--rw-ink)',
                            color: 'var(--rw-paper)',
                          }}
                          title={`「${w.lemma}」だけで再挑戦`}
                        >
                          🔁
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 累計学習統計 (生徒のがんばり全体像) */}
            {cumulativeStats.totalAnswered > 0 && (
              <div className="mb-5 text-left">
                <h3 className="text-xs font-black tracking-wider text-rw-ink-soft mb-2 uppercase">
                  これまでの累計
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'var(--rw-accent-soft)' }}>
                    <div className="text-xs text-rw-ink-soft font-bold">累計正答率</div>
                    <div className="text-2xl font-black text-rw-accent mt-0.5">
                      {Math.round((cumulativeStats.totalCorrect / cumulativeStats.totalAnswered) * 100)}%
                    </div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'var(--rw-primary-soft)' }}>
                    <div className="text-xs text-rw-ink-soft font-bold">挑戦回数</div>
                    <div className="text-2xl font-black text-rw-primary mt-0.5">
                      {cumulativeStats.totalAnswered}
                    </div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'var(--rw-pop)', opacity: 0.85 }}>
                    <div className="text-xs text-rw-ink font-bold">マスター</div>
                    <div className="text-2xl font-black text-rw-ink mt-0.5">
                      {cumulativeStats.masteredCount}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* アクションボタン（今日の分は「終わる」が既定、もう1セットは任意） */}
            <div className="space-y-2.5">
              {quizMode === 'today' ? (
                <>
                  <button
                    onClick={onGoHome}
                    className="w-full font-black py-3.5 px-4 rounded-full bg-rw-ink text-rw-paper transition-transform active:scale-95 tracking-wider"
                    style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
                  >
                    今日はここまで（ホームへ）
                  </button>
                  <button
                    onClick={onAnotherSet}
                    className="w-full font-bold py-3.5 px-4 rounded-full bg-rw-paper text-rw-ink border-2 border-rw-rule hover:bg-rw-primary-soft transition-colors"
                  >
                    もう1セット ▶
                  </button>
                  {nextRangeForEnd && (
                    <button
                      onClick={() => onNextRange(nextRangeForEnd)}
                      className="w-full font-bold py-3.5 px-4 rounded-full bg-rw-paper text-rw-ink border-2 border-rw-rule hover:bg-rw-primary-soft transition-colors"
                    >
                      {nextRangeLabel(nextRangeForEnd)} ▶
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate('/vocab')}
                    className="w-full font-bold py-3 px-4 rounded-full bg-transparent text-rw-ink-soft border-2 border-rw-rule hover:bg-rw-primary-soft transition-colors"
                  >
                    単語のホーム（単語一覧）へ
                  </button>
                </>
              ) : (
                <>
                  {returnTo && (
                    <button
                      onClick={() => onNavigate(returnTo)}
                      className="w-full font-black py-3.5 px-4 rounded-full bg-rw-ink text-rw-paper transition-transform active:scale-95 tracking-wider"
                      style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
                    >
                      📖 {returnLabels(returnTo).long}
                    </button>
                  )}
                  {!returnTo && nextRangeForEnd && (
                    <button
                      onClick={() => onNextRange(nextRangeForEnd)}
                      className="w-full font-black py-3.5 px-4 rounded-full bg-rw-ink text-rw-paper transition-transform active:scale-95 tracking-wider"
                      style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
                    >
                      {nextRangeLabel(nextRangeForEnd)} ▶
                    </button>
                  )}
                  <button
                    onClick={onRestart}
                    className={returnTo || nextRangeForEnd
                      ? "w-full font-bold py-3.5 px-4 rounded-full bg-rw-paper text-rw-ink border-2 border-rw-rule hover:bg-rw-primary-soft transition-colors"
                      : "w-full font-black py-3.5 px-4 rounded-full bg-rw-ink text-rw-paper transition-transform active:scale-95 tracking-wider"}
                    style={returnTo || nextRangeForEnd ? undefined : { boxShadow: '0 4px 0 var(--rw-primary)' }}
                  >
                    {returnTo ? "もう一度解く ▶" : "同じ範囲を繰り返す ▶"}
                  </button>
                  {currentMode === 'word' && (
                    <button
                      onClick={() => onNavigate('/vocab')}
                      className="w-full font-bold py-3.5 px-4 rounded-full bg-rw-paper text-rw-ink border-2 border-rw-rule hover:bg-rw-primary-soft transition-colors"
                    >
                      単語のホーム（単語一覧）へ
                    </button>
                  )}
                  <button
                    onClick={onGoHome}
                    className="w-full font-bold py-3.5 px-4 rounded-full bg-rw-paper text-rw-ink border-2 border-rw-rule hover:bg-rw-primary-soft transition-colors"
                  >
                    ホームに戻る
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
