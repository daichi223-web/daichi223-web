import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getVocabEntries, type VocabEntry } from '@/lib/kobun/progress';
import { readStreak } from '@/lib/streak';

// Reiwa デザイン版ホーム画面。
// handoff/dir-reiwa.jsx の RwHome を本番ロジックと結線したもの。
//
// 構成 (上から):
//  1. ヘッダ: kobun. + 日付 + 単語帳件数 (🔥)
//  2. Today's Quest カード: 現在の mode + range を表示し「つづきから」でクイズへ
//  3. 4 タイル: 単語クイズ / 多義語クイズ / 読解 / 単語帳
//  4. 気になってる単語: localStorage の単語帳から最新 5 件
//  5. テーマピッカーへの誘導 (詳細設定は別途、クイズ画面でアクセス可能)

type Props = {
  currentMode: 'word' | 'polysemy';
  wordRange: { from: number | null; to: number | null };
  polysemyRange: { from: number | null; to: number | null };
  wordQuizTypeLabel: string;
  polysemyQuizTypeLabel: string;
  weakWordsCount: number;
  dueWordsCount: number;
  onStartQuiz: () => void;
  onStartReview: () => void;
  onStartSrsReview: () => void;
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
  wordQuizTypeLabel,
  polysemyQuizTypeLabel,
  weakWordsCount,
  dueWordsCount,
  onStartQuiz,
  onStartReview,
  onStartSrsReview,
  onSwitchMode,
  onOpenThemePicker,
}: Props) {
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    setVocab(getVocabEntries());
    setStreak(readStreak().current);
  }, []);

  const range = currentMode === 'word' ? wordRange : polysemyRange;
  const quizTypeLabel = currentMode === 'word' ? wordQuizTypeLabel : polysemyQuizTypeLabel;
  const rangeLabel =
    range.from && range.to
      ? `${range.from}〜${range.to}`
      : range.from
      ? `${range.from}〜`
      : range.to
      ? `〜${range.to}`
      : '範囲未指定';

  return (
    <div className="bg-rw-bg min-h-dvh -mx-3 md:-mx-6 -mt-16 md:mt-0 px-4 md:px-6 pt-4 md:pt-6 pb-8 text-rw-ink">
      {/* ヘッダ */}
      <div className="flex items-center justify-between pt-12 md:pt-0 mb-4 md:mb-5">
        <div>
          <div className="text-2xl md:text-3xl font-black tracking-tight leading-none">kobun.</div>
          <div className="text-[11px] text-rw-ink-soft mt-1">{todayLabel()}</div>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rw-primary text-rw-paper rounded-full text-xs font-bold"
          title={streak > 0 ? `${streak}日連続学習中` : 'クイズで答えると連続日数が増える'}
        >
          <span>🔥</span>
          <span>{streak}</span>
        </div>
      </div>

      {/* Today's Quest — SRS 期日到来があれば優先、なければ通常範囲 */}
      <button
        onClick={dueWordsCount > 0 ? onStartSrsReview : onStartQuiz}
        className="w-full text-left mb-4 p-5 md:p-6 bg-rw-primary text-rw-paper rounded-3xl relative overflow-hidden group hover:opacity-95 transition-opacity"
      >
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-rw-pop opacity-40" />
        <div className="absolute -bottom-5 right-5 w-20 h-20 rounded-full bg-rw-accent opacity-40" />
        <div className="relative">
          <div className="text-[10px] md:text-xs opacity-90 font-bold tracking-wider uppercase">Today's Quest</div>
          {dueWordsCount > 0 ? (
            <>
              <div className="text-xl md:text-2xl font-black mt-1.5 leading-tight">
                今日の復習
                <br />
                <span className="text-base md:text-lg opacity-90 font-bold">SRS が選んだ単語</span>
              </div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-3xl md:text-4xl font-black">{dueWordsCount}</span>
                <span className="text-sm md:text-base opacity-90">語</span>
              </div>
              <div className="mt-4 inline-block bg-rw-paper text-rw-primary text-sm font-black px-5 py-2 rounded-full tracking-wide group-hover:translate-x-1 transition-transform">
                復習スタート ▶
              </div>
            </>
          ) : (
            <>
              <div className="text-xl md:text-2xl font-black mt-1.5 leading-tight">
                {currentMode === 'word' ? '単語クイズ' : '多義語クイズ'}
                <br />
                <span className="text-base md:text-lg opacity-90 font-bold">{quizTypeLabel}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-3xl md:text-4xl font-black">{rangeLabel}</span>
              </div>
              <div className="mt-4 inline-block bg-rw-paper text-rw-primary text-sm font-black px-5 py-2 rounded-full tracking-wide group-hover:translate-x-1 transition-transform">
                つづきから ▶
              </div>
            </>
          )}
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
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <TileLinkInline
          href="/read/vocab"
          label={vocab.length > 0 ? `単語帳 (${vocab.length})` : '単語帳'}
          emoji="📒"
        />
        <TileLinkInline href="/stats" label="学習履歴" emoji="📊" />
      </div>

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

      {/* テーマピッカー誘導 (詳細設定は「つづきから」後のクイズ画面で利用) */}
      <button
        onClick={onOpenThemePicker}
        className="w-full mt-2 flex items-center justify-between py-2.5 px-4 bg-rw-paper rounded-xl border border-rw-rule text-sm font-bold text-rw-ink-soft hover:bg-rw-primary-soft transition"
      >
        <span className="flex items-center gap-2">
          <span>🎨</span>
          <span>テーマを変更</span>
        </span>
        <span>▸</span>
      </button>
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
