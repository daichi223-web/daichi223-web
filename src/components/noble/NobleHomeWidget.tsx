import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  type PartLevels,
  PART_MAX_LV,
  PART_LABEL,
  effectiveStage,
  nextStage,
  TIER_TONE,
} from '@/lib/nobleData';
import { recordPromotion } from '@/lib/promotionHistory';
import WatercolorPortrait from './WatercolorPortrait';

// ホーム (HomeReiwa) に挿入する小型サマリ。
// 左に水彩肖像、右に位階情報 + 5 部位 Lv ミニグリッド。
// 下部に「学習履歴の蓄積」3 タイル (連続日数 / 累計回答 / 真のマスター数)。
// 全体タップで /stats に遷移して詳細を見る動線。

type Props = {
  parts: PartLevels;
  streak: number;
  totalAnswered: number;
  masterCount: number;
};

export default function NobleHomeWidget({ parts, streak, totalAnswered, masterCount }: Props) {
  const stage = effectiveStage(parts);
  const next = nextStage(parts, stage.n);
  const tone = TIER_TONE[stage.era];
  const progress = next ? Math.round(((5 - next.blocking.length) / 5) * 100) : 100;

  useEffect(() => {
    recordPromotion(stage.n);
  }, [stage.n]);

  return (
    <div className="mb-4">
      <div className="text-xs font-bold text-rw-ink-soft mb-2 flex items-baseline justify-between">
        <span>装束で見る学習の蓄積</span>
        <Link to="/stats" className="text-[10px] text-rw-ink-soft no-underline hover:text-rw-ink">
          詳細 →
        </Link>
      </div>

      <Link
        to="/stats"
        className="block bg-rw-paper border border-rw-rule rounded-2xl p-3 no-underline text-rw-ink hover:border-rw-ink-soft transition"
        style={{ textDecoration: 'none' }}
      >
        {/* 上段: 肖像 + 位階情報 */}
        <div className="flex gap-3 items-stretch">
          <div className="shrink-0">
            <WatercolorPortrait stageN={stage.n} height={130} aspect={0.71} showSeal={false} />
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            {/* 位階ヘッダ */}
            <div className="flex items-baseline gap-2">
              <span
                className="text-[10px] font-black tracking-wider"
                style={{ color: tone.fg }}
              >
                {stage.era}
              </span>
              <span className="text-[9px] text-rw-ink-soft font-mono ml-auto">
                第{stage.n} / 21
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span
                className="text-xl font-black leading-none"
                style={{ color: tone.fg, fontFamily: '"Noto Serif JP", serif' }}
              >
                {stage.rank}
              </span>
            </div>
            <div className="text-[10px] text-rw-ink-soft truncate mt-0.5">
              {stage.post}
            </div>

            {/* 5 部位 Lv ミニグリッド */}
            <div className="grid grid-cols-5 gap-1 mt-2">
              {(['head', 'robe', 'train', 'item', 'belt'] as const).map((k) => (
                <div
                  key={k}
                  className="rounded border border-rw-rule px-1 py-0.5 text-center"
                  style={{ background: 'var(--rw-paper)' }}
                  title={`${PART_LABEL[k]} Lv${parts[k]} / ${PART_MAX_LV[k]}`}
                >
                  <div className="text-[8px] text-rw-ink-soft leading-none">{PART_LABEL[k]}</div>
                  <div className="text-[11px] font-black text-rw-ink leading-tight">
                    {parts[k]}
                    <span className="text-[7px] text-rw-ink-soft font-mono">/{PART_MAX_LV[k]}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 次の昇進ストリップ */}
            {next ? (
              <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                <span className="text-rw-ink-soft">次→</span>
                <span className="font-bold text-rw-ink truncate flex-1">
                  {next.stage.milestone && <span style={{ color: tone.accent }}>★</span>}
                  {next.stage.rank}
                </span>
                <span
                  className="font-mono font-bold shrink-0"
                  style={{ color: tone.accent }}
                >
                  {progress}%
                </span>
              </div>
            ) : (
              <div className="mt-2 text-[10px] font-bold" style={{ color: tone.accent }}>
                👑 極位達成
              </div>
            )}
          </div>
        </div>

        {/* 下段: 蓄積3タイル */}
        <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-rw-rule">
          <StatTile value={streak} label="連続日数" suffix="日" />
          <StatTile value={totalAnswered} label="累計回答" suffix="回" />
          <StatTile value={masterCount} label="真のマスター" suffix="語" />
        </div>
      </Link>
    </div>
  );
}

function StatTile({ value, label, suffix }: { value: number; label: string; suffix: string }) {
  return (
    <div className="text-center">
      <div className="text-base font-black text-rw-ink leading-none">
        {value.toLocaleString()}
        <span className="text-[9px] font-bold text-rw-ink-soft ml-0.5">{suffix}</span>
      </div>
      <div className="text-[9px] text-rw-ink-soft mt-0.5">{label}</div>
    </div>
  );
}
