import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  type PartLevels,
  effectiveStage,
  nextStage,
  portraitForStage,
  TIER_TONE,
} from '@/lib/nobleData';
import { recordPromotion } from '@/lib/promotionHistory';

// ホーム/学習履歴の最上部に置く統合ステータスバー。
// 1段 ~90px で 「肖像サムネ + 位階 + 次の昇進バー + 3 KPI」を集約。
// ホームでは /stats へのリンク、StatsPage では非リンク (既に詳細画面)。

type Props = {
  parts: PartLevels;
  streak: number;
  totalAnswered: number;
  masterCount: number;
  // true なら全体がタップで /stats へ。false なら静的表示。
  linkToStats?: boolean;
};

export default function NobleStatusBar({
  parts,
  streak,
  totalAnswered,
  masterCount,
  linkToStats = true,
}: Props) {
  const stage = effectiveStage(parts);
  const next = nextStage(parts, stage.n);
  const portrait = portraitForStage(stage.n);
  const tone = TIER_TONE[stage.era];
  const progress = next ? Math.round(((5 - next.blocking.length) / 5) * 100) : 100;

  useEffect(() => {
    recordPromotion(stage.n);
  }, [stage.n]);

  const Inner = (
    <div
      className="flex items-stretch gap-3 px-3 py-2.5 bg-rw-paper border border-rw-rule rounded-2xl"
    >
      {/* 肖像サムネ (固定 56x76) */}
      <div
        className="shrink-0 relative overflow-hidden rounded-lg"
        style={{
          width: 56,
          height: 76,
          background: '#f6efe0',
          border: '1px solid rgba(60,40,20,0.2)',
        }}
      >
        <img
          src={portrait.src}
          alt={portrait.label}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${portrait.focusX}% ${portrait.focusY}%`,
            pointerEvents: 'none',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 80% 95% at 50% 55%, transparent 60%, ${portrait.palette[2]}40 100%)`,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* 中央: 位階 + 次の昇進バー */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[9px] font-black tracking-wider"
              style={{ color: tone.fg }}
            >
              {stage.era}
            </span>
            <span className="text-[9px] font-mono text-rw-ink-soft">
              第{stage.n}階
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className="text-base font-black leading-none truncate"
              style={{ color: tone.fg, fontFamily: '"Noto Serif JP", serif' }}
            >
              {stage.rank}
            </span>
            <span className="text-[10px] text-rw-ink-soft truncate">
              {stage.post.split('・')[0]}
            </span>
          </div>
        </div>

        {/* 次の昇進プログレス */}
        {next ? (
          <div className="mt-1">
            <div className="flex items-center gap-1.5 text-[9px] mb-0.5">
              <span className="text-rw-ink-soft">次</span>
              <span className="font-bold text-rw-ink truncate flex-1">
                {next.stage.milestone && <span style={{ color: tone.accent }}>★</span>}
                {next.stage.rank}
              </span>
              <span
                className="font-mono font-black shrink-0"
                style={{ color: tone.accent }}
              >
                {progress}%
              </span>
            </div>
            <div className="h-1 rounded-full" style={{ background: 'var(--rw-rule)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: tone.accent }}
              />
            </div>
          </div>
        ) : (
          <div className="text-[10px] font-bold mt-1" style={{ color: tone.accent }}>
            👑 極位達成
          </div>
        )}
      </div>

      {/* 右: 3 KPI 縦並び */}
      <div className="shrink-0 flex flex-col justify-between text-right py-0.5 leading-none">
        <KPI label="連続" value={streak} suffix="日" emoji="🔥" />
        <KPI label="回答" value={totalAnswered} suffix="回" />
        <KPI label="master" value={masterCount} suffix="語" emoji="👑" />
      </div>
    </div>
  );

  if (linkToStats) {
    return (
      <Link
        to="/stats"
        className="block mb-4 no-underline text-rw-ink hover:opacity-95 transition-opacity"
        style={{ textDecoration: 'none' }}
      >
        {Inner}
      </Link>
    );
  }
  return <div className="mb-4">{Inner}</div>;
}

function KPI({
  label,
  value,
  suffix,
  emoji,
}: {
  label: string;
  value: number;
  suffix: string;
  emoji?: string;
}) {
  return (
    <div className="flex items-baseline gap-1 justify-end">
      {emoji && <span className="text-[10px]">{emoji}</span>}
      <span className="text-xs font-black text-rw-ink">
        {value.toLocaleString()}
        <span className="text-[8px] font-bold text-rw-ink-soft ml-0.5">{suffix}</span>
      </span>
      <span className="text-[8px] text-rw-ink-soft sr-only">{label}</span>
    </div>
  );
}
