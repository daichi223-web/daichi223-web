import { useEffect, useState } from 'react';
import './HomeReiwa.css';
import { getAccountStatus, type AccountStatus } from '@/lib/auth';
import { getCohort } from '@/lib/cohort';
import { schoolLabel, isTeacherEmail } from '@/lib/schools';
import { AUTH_REQUIRED } from '@/lib/authFlags';
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
import { usePortraitTone } from '@/lib/portraitTone';
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
  dataError?: boolean;
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
  dataError = false,
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
  const [portraitTone] = usePortraitTone();
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
  const noblePortrait = nobleStage ? portraitForStage(nobleStage.n, portraitTone) : null;
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
    <div className="study-home bg-rw-bg min-h-dvh px-4 md:px-6 pt-4 md:pt-6 pb-8 text-rw-ink">
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
      {dataError && (
        <div className="mb-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900" role="alert">
          学習記録を取得できませんでした。通信状態を確認してから再読み込みしてください。
        </div>
      )}

      <section className="study-intro">
        <p className="study-eyebrow">毎日の積み重ねを、読める力に。</p>
        <h1>覚えたつもりを、<br />確かなことばに。</h1>
        <p>苦手を見つけて、思い出す。今日も少しずつ。</p>
      </section>

      <section className="study-quest" aria-labelledby="today-heading">
        <div className="study-quest-top">
          <span className="study-eyebrow">TODAY’S PRACTICE</span>
          <span className="study-time">目安 2〜3分</span>
        </div>
        <h2 id="today-heading">{welcomeBack ? 'おかえりなさい。少しずつ再開しよう。' : '今日の10問から、はじめよう。'}</h2>
        <p>{welcomeBack
          ? `${welcomeBack.gapDays}日ぶり。覚えていた${welcomeBack.warmupCount}語から始めます。`
          : '復習のタイミングと学習記録に合わせて、出題を選びます。'}</p>
        <div className="study-session">
          <div className="study-session-count"><strong>{todayTotal + (welcomeBack?.warmupCount ?? 0)}</strong><span>問の予定</span></div>
          <div className="study-session-detail">
            <span>期限が来た復習 <b>{todayPreview.review}</b> 問</span>
            <span>苦手・未着手など <b>{todayPreview.fresh}</b> 問</span>
          </div>
        </div>
        <button className="study-start" onClick={onStartToday}>今日の学習をはじめる <span aria-hidden="true">→</span></button>
        <div className="study-range">出題範囲：{rangeLabel} <span>※復習は範囲外を含む場合があります</span></div>
      </section>

      <section className="study-review" aria-labelledby="review-heading">
        <div>
          <span className="study-eyebrow">REVIEW</span>
          <h2 id="review-heading">苦手を、そのままにしない。</h2>
          <p>{dataError ? '学習記録を再読み込みしてください。' : weakWordsCount > 0 ? `${weakWordsCount}件の意味を重点的に復習できます。` : '苦手が見つかると、ここからまとめて復習できます。'}</p>
        </div>
        <button onClick={onStartReview} disabled={dataError || weakWordsCount === 0}>苦手を復習 <span aria-hidden="true">↗</span></button>
      </section>
      <details className="study-method">
        <summary>どうやって定着させるの？</summary>
        <ol>
          <li><b>間違えた意味を記録。</b> 初回の誤答から、苦手の候補に入ります。</li>
          <li><b>解き直して、翌日も確認。</b> その場の正解だけで定着とは判定しません。</li>
          <li><b>1日 → 3日 → 7日 → 14日。</b> 復習期限を迎えて正解すると間隔が延び、間違えると最初の段階に戻ります。</li>
        </ol>
        <p>今日の復習は最大10問。解き直しは結果画面から、次の日の確認は「今日の学習」から。</p>
      </details>

      {nobleStage && noblePortrait && (
        <Link to="/stats" className="study-achievement">
          <img src={noblePortrait.thumb} alt={noblePortrait.label} style={{ objectPosition: `${noblePortrait.focusX}% ${noblePortrait.focusY}%` }} />
          <div><span className="study-eyebrow">あなたの歩み</span><strong>{nobleStage.rank} <small>{nobleStage.post.split('・')[0]}</small></strong>
            <span>{nobleNext ? `次は ${nobleNext.stage.rank}・${nobleProgress}%` : '極位達成'}</span></div>
          <div className="study-achievement-stats"><b>{streak}日</b><span>連続学習</span><span>回答 {totalAnswered.toLocaleString()} / 習得 {totalMastered}</span></div>
        </Link>
      )}
      <div className="study-section-label"><h2>学び方を選ぶ</h2><span>自分のペースで、もう一歩。</span></div>

      {/* 4 タイル */}
      <div className="study-modes grid grid-cols-2 gap-2.5 mb-4">
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
      <div className="study-shortcuts grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
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
                {!account.isAnonymous
                  ? `登録済み（${schoolLabel(getCohort())}）`
                  : AUTH_REQUIRED ? 'はじめに登録' : '記録を引き継ぐ'}
              </span>
              <span className="block text-[10.5px] text-rw-ink-soft font-semibold truncate">
                {account.isAnonymous ? '学校のメールで登録すると、別の端末・別のブラウザでも続きから' : account.email}
              </span>
            </span>
            <span className="text-rw-ink-soft text-sm">→</span>
          </div>
        </Link>
      )}

      {/* 先生（@spec.ed.jp）だけに出す管理画面への入口。
          画面自体は先生用パスワードで守られているので、このリンクは道しるべにすぎない */}
      {account && !account.isAnonymous && isTeacherEmail(account.email ?? '') && (
        <Link
          to="/teacher"
          className="block bg-rw-paper border border-rw-rule rounded-2xl px-4 py-2.5 mb-4 hover:border-rw-ink-soft transition no-underline text-rw-ink"
          style={{ textDecoration: 'none' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🗂️</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-black tracking-tight">教員管理画面</span>
              <span className="block text-[10.5px] text-rw-ink-soft font-semibold truncate">
                利用状況・教材公開・小テスト範囲（先生用のパスワードが必要）
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
      <div className="text-[11px] font-bold mt-0.5 text-rw-ink-soft">
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
