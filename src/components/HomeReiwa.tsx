import { useEffect, useState } from 'react';
import { getAccountStatus, type AccountStatus } from '@/lib/auth';
import { Link } from 'react-router-dom';
import { getVocabEntries, type VocabEntry } from '@/lib/kobun/progress';
import { readStreak } from '@/lib/streak';
import { useFieldMastery } from '@/lib/fieldMastery';
import {
  partsFromFieldMastery,
  effectiveStage,
  nextStage,
  portraitForStage,
} from '@/lib/nobleData';
import { recordPromotion } from '@/lib/promotionHistory';
import { quizRangeHeadline, type QuizRange } from '@/lib/quizRange';

// Reiwa デザイン版ホーム画面。
// handoff/dir-reiwa.jsx の RwHome を本番ロジックと結線したもの。
//
// 構成 (上から):
//  1. ヘッダ: kobun. + 日付 + 単語帳件数 (🔥)
//  2. Today's Quest カード: 「今日の分」1ボタン（おかえり語→今日の復習→範囲から補充、で約10問）
//  3. 4 タイル: 単語クイズ / 多義語クイズ / 読解 / 単語帳
//  4. 気になってる単語: localStorage の単語帳から最新 5 件
//  5. テーマピッカーへの誘導 (詳細設定は別途、クイズ画面でアクセス可能)

type Props = {
  currentMode: 'word' | 'polysemy';
  // 範囲は localStorage 由来なので未設定は undefined（null ではない）
  wordRange: { from?: number | null; to?: number | null };
  polysemyRange: { from?: number | null; to?: number | null };
  weakWordsCount: number;
  dueWordsCount: number;
  // 長い空白のあと: 空白日数と、先頭に置く「覚えていた語」の数（null なら通常）
  welcomeBack?: { gapDays: number; warmupCount: number } | null;
  // 今日の分の見込み: 復習（期限到来・上限つき）と補充（範囲からおまかせ）の語数
  todayPreview: { review: number; fresh: number };
  // 教員が設定した小テスト範囲（無ければ null）
  quizRange?: QuizRange | null;
  onStartToday: () => void;
  onStartQuizRange?: (r: QuizRange) => void;
  onStartReview: () => void;
  onSwitchMode: (mode: 'word' | 'polysemy') => void;
  onOpenThemePicker: () => void;
};

function todayLabel(): string {
  const d = new Date();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

export default function HomeReiwa({
  currentMode,
  wordRange,
  polysemyRange,
  weakWordsCount,
  dueWordsCount,
  welcomeBack = null,
  todayPreview,
  quizRange = null,
  onStartToday,
  onStartQuizRange,
  onStartReview,
  onSwitchMode,
  onOpenThemePicker,
}: Props) {
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const { fieldMastery, totalAnswered, totalMastered, loading: masteryLoading } = useFieldMastery();

  useEffect(() => {
    setVocab(getVocabEntries());
    setStreak(readStreak().current);
    getAccountStatus().then(setAccount).catch(() => setAccount(null));
  }, []);

  // 装束ステータス (Today's Quest 内で表示する位階情報) を導出。
  const parts = !masteryLoading ? partsFromFieldMastery(fieldMastery) : null;
  const nobleStage = parts ? effectiveStage(parts) : null;
  const nobleNext = parts && nobleStage ? nextStage(parts, nobleStage.n) : null;
  const noblePortrait = nobleStage ? portraitForStage(nobleStage.n) : null;
  const nobleProgress = nobleNext
    ? Math.round(((5 - nobleNext.blocking.length) / 5) * 100)
    : 100;

  // 到達した階位を localStorage に記録 (昇進履歴用)。
  useEffect(() => {
    if (nobleStage) recordPromotion(nobleStage.n);
  }, [nobleStage?.n]);

  const range = currentMode === 'word' ? wordRange : polysemyRange;
  const rangeLabel =
    range.from && range.to
      ? `${range.from}〜${range.to}`
      : range.from
      ? `${range.from}〜`
      : range.to
      ? `〜${range.to}`
      : '範囲未指定';
  // 今日の分の語数（おかえり語は別に足す）
  const todayTotal = todayPreview.review + todayPreview.fresh;
  // 小テスト範囲（期日を過ぎたものは出さない）
  const quizRangeLine = quizRange ? quizRangeHeadline(quizRange) : null;

  return (
    <div className="bg-rw-bg min-h-dvh -mx-3 md:-mx-6 -mt-16 md:mt-0 px-4 md:px-6 pt-4 md:pt-6 pb-8 text-rw-ink">
      {/* 最小ヘッダ: 日付のみ。位階情報は Today's Quest 内に集約 */}
      <div className="pt-12 md:pt-0 mb-3 flex items-baseline justify-between">
        <div className="text-2xl md:text-3xl font-black tracking-tight leading-none">kobun.</div>
        <div className="text-[10px] text-rw-ink-soft font-mono">{todayLabel()}</div>
      </div>

      {/* 小テスト範囲（教員が設定したときだけ最上段に出す） */}
      {quizRange && quizRangeLine && onStartQuizRange && (
        <button
          onClick={() => onStartQuizRange(quizRange)}
          className="w-full text-left mb-2.5 px-4 py-3 rounded-2xl border-2 border-rw-ink bg-rw-pop text-rw-ink hover:-translate-y-0.5 transition-transform"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📌</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-black tracking-tight truncate">{quizRangeLine}</span>
              <span className="block text-[11px] font-bold opacity-80">
                {quizRange.from}〜{quizRange.to}
                {quizRange.note ? `・${quizRange.note}` : ''}
              </span>
            </span>
            <span className="text-xs font-black shrink-0">この範囲で ▶</span>
          </div>
        </button>
      )}

      {/* Today's Quest — 左に装束 / 右にクイズ CTA の 2 カラム配置 */}
      <button
        onClick={onStartToday}
        className="w-full text-left mb-4 p-4 bg-rw-primary text-rw-paper rounded-3xl relative overflow-hidden group hover:opacity-95 transition-opacity"
      >
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-rw-pop opacity-30 pointer-events-none" />
        <div className="absolute -bottom-5 right-5 w-20 h-20 rounded-full bg-rw-accent opacity-30 pointer-events-none" />
        <div className="relative grid grid-cols-[auto_1fr] gap-3 items-stretch">
          {/* LEFT: 装束ストリップ (肖像 + 位階 + 進捗 + KPI) */}
          {nobleStage && noblePortrait ? (
            <div className="flex flex-col gap-1.5" style={{ width: 140 }}>
              <div className="flex items-stretch gap-2">
                <div
                  className="shrink-0 relative overflow-hidden rounded-md"
                  style={{
                    width: 40,
                    height: 54,
                    background: '#f6efe0',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                >
                  <img
                    src={noblePortrait.thumb}
                    decoding="async"
                    alt={noblePortrait.label}
                    draggable={false}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: `${noblePortrait.focusX}% ${noblePortrait.focusY}%`,
                      pointerEvents: 'none',
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] flex items-baseline gap-1">
                    <span className="opacity-90 font-bold tracking-wider">{nobleStage.era}</span>
                    <span className="opacity-70 font-mono text-[8px]">第{nobleStage.n}</span>
                  </div>
                  <div
                    className="text-[15px] font-black leading-none mt-0.5 truncate"
                    style={{ fontFamily: '"Noto Serif JP", serif' }}
                  >
                    {nobleStage.rank}
                  </div>
                  <div className="text-[9px] opacity-80 truncate mt-0.5">
                    {nobleStage.post.split('・')[0]}
                  </div>
                </div>
              </div>

              {/* 次の昇進 */}
              {nobleNext ? (
                <div>
                  <div className="flex items-center gap-1 text-[9px]">
                    <span className="opacity-70">次</span>
                    <span className="opacity-95 truncate flex-1 font-bold">
                      {nobleNext.stage.milestone && <span>★</span>}
                      {nobleNext.stage.rank}
                    </span>
                    <span className="font-mono font-black">{nobleProgress}%</span>
                  </div>
                  <div className="h-0.5 mt-0.5 rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${nobleProgress}%`, background: 'var(--rw-pop)' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-[10px] font-black" style={{ color: 'var(--rw-pop)' }}>
                  👑 極位達成
                </div>
              )}

              {/* 3 KPI 横並び */}
              <div className="flex justify-between text-[10px] leading-none pt-0.5">
                <span>
                  🔥<b className="text-[11px] ml-0.5">{streak}</b>
                </span>
                <span>
                  📚<b className="text-[11px] ml-0.5">{totalAnswered.toLocaleString()}</b>
                </span>
                <span>
                  👑<b className="text-[11px] ml-0.5">{totalMastered}</b>
                </span>
              </div>
            </div>
          ) : (
            <div style={{ width: 140 }} />
          )}

          {/* 区切り線 */}
          <div className="relative flex flex-col min-w-0">
            <div
              className="absolute left-0 top-2 bottom-2 w-px"
              style={{ background: 'rgba(255,255,255,0.25)', marginLeft: -6 }}
              aria-hidden
            />

            {/* RIGHT: クイズ CTA */}
            <div className="flex flex-col justify-between min-w-0 h-full">
              <div>
                <div className="text-[10px] opacity-90 font-bold tracking-wider uppercase">
                  Today's Quest
                </div>
                {welcomeBack ? (
                  <>
                    <div className="text-base md:text-lg font-black mt-1 leading-tight">
                      おかえり
                    </div>
                    <div className="text-[11px] opacity-90 font-bold leading-tight">
                      {welcomeBack.gapDays}日ぶり。まず覚えていた{welcomeBack.warmupCount}語から
                    </div>
                    <div className="flex items-baseline gap-1 mt-1.5">
                      <span className="text-3xl font-black">{welcomeBack.warmupCount + todayTotal}</span>
                      <span className="text-xs opacity-90">語・2〜3分</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-base md:text-lg font-black mt-1 leading-tight">
                      今日の分
                    </div>
                    <div className="text-[11px] opacity-90 font-bold leading-tight truncate">
                      {todayPreview.review > 0
                        ? `復習 ${todayPreview.review}語 ＋ 新しく ${todayPreview.fresh}語`
                        : `${rangeLabel} から、苦手・未着手を優先`}
                    </div>
                    <div className="flex items-baseline gap-1 mt-1.5">
                      <span className="text-3xl font-black">{todayTotal}</span>
                      <span className="text-xs opacity-90">語・2〜3分</span>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-2 inline-block self-start bg-rw-paper text-rw-primary text-xs font-black px-3.5 py-1.5 rounded-full tracking-wide group-hover:translate-x-1 transition-transform">
                {welcomeBack ? 'おかえり ▶' : '今日の分 ▶'}
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* 4 タイル */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <Tile
          emoji="📚"
          label="単語"
          stat={currentMode === 'word' ? '選択中' : 'クイズ'}
          onClick={() => onSwitchMode('word')}
          iconBg="var(--rw-accent-soft)"
          fgColor="var(--rw-accent)"
          active={currentMode === 'word'}
        />
        <Tile
          emoji="🌸"
          label="多義語"
          stat={currentMode === 'polysemy' ? '選択中' : 'クイズ'}
          onClick={() => onSwitchMode('polysemy')}
          iconBg="var(--rw-primary-soft)"
          fgColor="var(--rw-primary)"
          active={currentMode === 'polysemy'}
        />
        <TileLink href="/read" emoji="📖" label="読解" stat="本文を読む" iconBg="var(--rw-pop)" fgColor="var(--rw-ink)" />
        <TileLink
          href="/read/grammar"
          emoji="⚔️"
          label="文法道場"
          stat="ドリル＋識別"
          iconBg="var(--rw-primary)"
          fgColor="var(--rw-paper)"
        />
        <TileLink
          href="/vocab"
          emoji="🗂️"
          label="単語ホーム"
          stat="理解・練習・見分け"
          iconBg="var(--rw-accent)"
          fgColor="var(--rw-paper)"
        />
        <Tile
          emoji="🔁"
          label="苦手復習"
          stat={weakWordsCount > 0 ? `${weakWordsCount}語` : 'まだなし'}
          onClick={() => weakWordsCount > 0 && onStartReview()}
          iconBg="var(--rw-tertiary)"
          fgColor="var(--rw-paper)"
          disabled={weakWordsCount === 0}
        />
      </div>

      {/* 単語帳・学習履歴ショートカット */}
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        <TileLinkInline
          href="/read/vocab"
          label={vocab.length > 0 ? `単語帳 ${vocab.length}` : '単語帳'}
          emoji="📒"
        />
        <TileLinkInline href="/stats" label="学習履歴" emoji="📊" />
        <button
          onClick={onOpenThemePicker}
          className="block bg-rw-paper border border-rw-rule rounded-2xl px-4 py-3 hover:border-rw-ink-soft transition text-rw-ink text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🎨</span>
            <span className="font-black text-rw-ink tracking-tight flex-1">テーマ</span>
            <span className="text-rw-ink-soft text-sm">▸</span>
          </div>
        </button>
      </div>

      {/* 記録の引き継ぎ（匿名なら登録を促し、登録済みなら状態だけ） */}
      {account && (
        <Link
          to="/account"
          className="block bg-rw-paper border border-rw-rule rounded-2xl px-4 py-2.5 mb-4 hover:border-rw-ink-soft transition no-underline text-rw-ink"
          style={{ textDecoration: 'none' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">📮</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-black tracking-tight">
                {account.isAnonymous ? '記録を引き継ぐ' : 'メール登録済み'}
              </span>
              <span className="block text-[10.5px] text-rw-ink-soft font-semibold truncate">
                {account.isAnonymous ? 'この端末だけの記録です。メールを付けると別の端末でも続きから' : account.email}
              </span>
            </span>
            <span className="text-rw-ink-soft text-sm">→</span>
          </div>
        </Link>
      )}

      {/* 気になってる単語 */}
      {vocab.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-rw-ink-soft mb-2">気になってる単語</div>
          <div className="flex gap-2 flex-wrap">
            {vocab.slice(0, 5).map((v) => (
              <Link
                key={`${v.baseForm}:${v.pos}`}
                to="/read/vocab"
                className="inline-block text-sm font-bold px-3 py-1.5 bg-rw-paper border-[1.5px] border-rw-ink rounded-full hover:bg-rw-primary-soft no-underline text-rw-ink"
                style={{ textDecoration: 'none' }}
              >
                {v.baseForm}
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function Tile({
  emoji,
  label,
  stat,
  onClick,
  iconBg,
  fgColor,
  active,
  disabled,
}: {
  emoji: string;
  label: string;
  stat: string;
  onClick: () => void;
  iconBg: string;
  fgColor: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left bg-rw-paper border rounded-2xl p-3.5 min-h-[96px] transition-all ${
        disabled
          ? 'border-rw-rule opacity-60 cursor-not-allowed'
          : active
          ? 'border-2 border-rw-ink shadow-md -translate-y-0.5'
          : 'border-rw-rule hover:border-rw-ink-soft'
      }`}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
        style={{ background: iconBg, color: fgColor }}
      >
        {emoji}
      </div>
      <div className="text-base font-black mt-2 tracking-tight text-rw-ink">{label}</div>
      <div className="text-[11px] font-bold mt-0.5" style={{ color: fgColor }}>
        {stat}
      </div>
    </button>
  );
}

function TileLinkInline({ href, label, emoji }: { href: string; label: string; emoji: string }) {
  return (
    <Link
      to={href}
      className="block bg-rw-paper border border-rw-rule rounded-2xl px-4 py-3 hover:border-rw-ink-soft transition no-underline text-rw-ink"
      style={{ textDecoration: 'none' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{emoji}</span>
        <span className="font-black text-rw-ink tracking-tight flex-1">{label}</span>
        <span className="text-rw-ink-soft text-sm">→</span>
      </div>
    </Link>
  );
}

function TileLink({
  href,
  emoji,
  label,
  stat,
  iconBg,
  fgColor,
}: {
  href: string;
  emoji: string;
  label: string;
  stat: string;
  iconBg: string;
  fgColor: string;
}) {
  return (
    <Link
      to={href}
      className="text-left bg-rw-paper border border-rw-rule rounded-2xl p-3.5 min-h-[96px] hover:border-rw-ink-soft transition no-underline text-rw-ink block"
      style={{ textDecoration: 'none' }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
        style={{ background: iconBg, color: fgColor }}
      >
        {emoji}
      </div>
      <div className="text-base font-black mt-2 tracking-tight text-rw-ink">{label}</div>
      <div className="text-[11px] font-bold mt-0.5 text-rw-ink-soft">{stat}</div>
    </Link>
  );
}
