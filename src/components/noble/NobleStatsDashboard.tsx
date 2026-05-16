import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type PartLevels,
  type PartKey,
  GENRES,
  PORTRAITS,
  PART_CHARTS,
  PART_LABEL,
  PART_MAX_LV,
  STAGES,
  effectiveStage,
  nextStage,
  portraitForStage,
  robeColorOf,
  TIER_TONE,
} from '@/lib/nobleData';
import { recordPromotion } from '@/lib/promotionHistory';
import RoadmapModal from './RoadmapModal';
import HistoryDrawer from './HistoryDrawer';

// StatsPage の theme='noble' 区画。掛軸スタイルで水彩肖像をヒーローに、
// 5 部位の装い詳細 + 5 ジャンル動線 + 出世絵巻/装束図鑑/履歴の3導線。

type Props = {
  parts: PartLevels;
};

export default function NobleStatsDashboard({ parts }: Props) {
  const [showZukan, setShowZukan] = useState(false);
  const [showRefs, setShowRefs] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // 掛軸ヒーローの開閉。デフォルト畳む (大きいため)。状態は localStorage に永続化。
  const [showKakejiku, setShowKakejiku] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kobun.noble.showKakejiku') === '1';
    } catch {
      return false;
    }
  });

  const toggleKakejiku = () => {
    const next = !showKakejiku;
    setShowKakejiku(next);
    try {
      localStorage.setItem('kobun.noble.showKakejiku', next ? '1' : '0');
    } catch {
      /* noop */
    }
  };

  const stage = effectiveStage(parts);
  const next = nextStage(parts, stage.n);
  const portrait = portraitForStage(stage.n);
  const tone = TIER_TONE[stage.era];
  const progress = next ? Math.round(((5 - next.blocking.length) / 5) * 100) : 100;
  const bandSize = portrait.toN - portrait.fromN + 1;
  const bandProgress = (stage.n - portrait.fromN + 1) / bandSize;

  useEffect(() => {
    recordPromotion(stage.n);
  }, [stage.n]);

  return (
    <div className="bg-rw-paper border border-rw-rule rounded-2xl overflow-hidden">
      {/* 掛軸トグル */}
      <button
        type="button"
        onClick={toggleKakejiku}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold tracking-wider text-rw-ink-soft hover:bg-rw-primary-soft/30 transition"
      >
        <span>
          {showKakejiku ? '装束 (掛軸) を畳む' : '装束 (掛軸) を見る'}
        </span>
        <span className="text-rw-ink-soft">{showKakejiku ? '▴' : '▾'}</span>
      </button>

      {showKakejiku && (
      <>
      {/* === 掛軸 (Kakejiku) ヒーロー === */}
      <div className="relative px-3 pt-3">
        {/* 上の軸木 */}
        <div
          className="relative h-2.5 -mx-1 rounded-sm shadow"
          style={{
            background:
              'linear-gradient(180deg, #b8945a 0%, #8a6f3a 45%, #6b5631 55%, #4a3a1a 100%)',
          }}
        >
          <div
            className="absolute -left-1 -top-0.5 w-2 h-3 rounded-full"
            style={{ background: 'radial-gradient(circle at 30% 30%, #d4ad6c, #6b5631)' }}
          />
          <div
            className="absolute -right-1 -top-0.5 w-2 h-3 rounded-full"
            style={{ background: 'radial-gradient(circle at 30% 30%, #d4ad6c, #6b5631)' }}
          />
        </div>

        {/* 表装 (絹縁) */}
        <div
          className="relative px-3 py-3.5 border border-t-0"
          style={{
            background: `linear-gradient(180deg, ${portrait.palette[2]}22, ${portrait.palette[2]}11 60%, ${portrait.palette[2]}22)`,
            borderColor: `${portrait.palette[2]}66`,
          }}
        >
          <div
            className="absolute top-0 left-3 right-3 h-1"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(201,162,90,0.5) 20%, rgba(201,162,90,0.5) 80%, transparent)',
            }}
            aria-hidden
          />

          {/* 肖像本体 */}
          <div
            className="relative border overflow-hidden"
            style={{
              borderColor: 'rgba(60,40,20,0.4)',
              background: '#f5ecd6',
              boxShadow: 'inset 0 0 30px rgba(60,40,20,0.08), 0 2px 8px rgba(60,40,20,0.15)',
            }}
          >
            <img
              src={portrait.src}
              alt={portrait.label}
              style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'cover' }}
            />

            {/* 落款 */}
            <div
              className="absolute bottom-2 right-2 flex items-center justify-center font-black"
              style={{
                width: 28,
                height: 28,
                background: '#b8423a',
                color: '#fff',
                fontFamily: '"Shippori Mincho", "Noto Serif JP", serif',
                fontSize: 9,
                lineHeight: 1,
                writingMode: 'vertical-rl',
                boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                transform: 'rotate(-2deg)',
              }}
            >
              第{stage.n}階
            </div>

            {/* 縦書きタイトル */}
            <div
              className="absolute top-2 right-2 font-black"
              style={{
                writingMode: 'vertical-rl',
                fontFamily: '"Shippori Mincho", "Noto Serif JP", serif',
                fontSize: 14,
                color: 'rgba(26,20,17,0.85)',
                letterSpacing: '0.15em',
                lineHeight: 1.1,
                textShadow: '0 0 6px rgba(245,236,214,0.9)',
                background:
                  'linear-gradient(270deg, rgba(245,236,214,0.7), rgba(245,236,214,0))',
                padding: '4px 2px 4px 12px',
              }}
            >
              {portrait.label}
            </div>
          </div>

          {/* 銘 (キャプション) */}
          <div className="mt-2 pt-2 border-t border-dashed flex items-center justify-between gap-3" style={{ borderColor: 'rgba(60,40,20,0.25)' }}>
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-black tracking-wide text-rw-ink"
                style={{ fontFamily: '"Noto Serif JP", serif' }}
              >
                {stage.rank}
                {stage.rank.length === 1 ? '位' : ''}
                <span className="text-[10px] text-rw-ink-soft font-normal ml-2">
                  {stage.post.split('・')[0]}
                </span>
              </div>
              <div className="text-[10px] text-rw-ink-soft tracking-wide mt-0.5 leading-snug">
                {portrait.note}
              </div>
            </div>
            <span
              className="text-[9px] font-black tracking-widest px-2 py-1 border whitespace-nowrap"
              style={{ color: tone.fg, borderColor: tone.fg, background: 'rgba(255,255,255,0.3)' }}
            >
              {stage.era}
            </span>
          </div>

          {/* 幅の進捗 */}
          <div className="mt-2">
            <div className="flex justify-between text-[9px] text-rw-ink-soft tracking-wider mb-1">
              <span>第 {portrait.fromN} 階</span>
              <span>
                {portrait.fromN === portrait.toN ? '一階のみ' : `第 ${portrait.toN} 階まで`}
              </span>
            </div>
            <div
              className="relative h-1 rounded"
              style={{ background: `${portrait.palette[2]}33` }}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${bandProgress * 100}%`, background: portrait.palette[1] }}
              />
              {Array.from({ length: bandSize }).map((_, i) => {
                const x = bandSize === 1 ? 50 : (i / (bandSize - 1)) * 100;
                const isHere = portrait.fromN + i === stage.n;
                return (
                  <div
                    key={i}
                    className="absolute top-1/2 rounded-full"
                    style={{
                      left: `${x}%`,
                      width: isHere ? 8 : 5,
                      height: isHere ? 8 : 5,
                      transform: 'translate(-50%, -50%)',
                      background: isHere ? portrait.palette[2] : '#f5ecd6',
                      border: `1px solid ${portrait.palette[2]}`,
                      boxShadow: isHere ? `0 0 0 2px ${portrait.palette[1]}55` : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* 下の軸木 */}
        <div
          className="relative h-3 -mx-1.5 rounded-sm shadow-md"
          style={{
            background:
              'linear-gradient(180deg, #6b5631 0%, #4a3a1a 50%, #2e2410 100%)',
          }}
        >
          <div
            className="absolute -left-1 top-0 w-3 h-3 rounded-full"
            style={{ background: 'radial-gradient(circle at 30% 30%, #b8945a, #3a2a1a)' }}
          />
          <div
            className="absolute -right-1 top-0 w-3 h-3 rounded-full"
            style={{ background: 'radial-gradient(circle at 30% 30%, #b8945a, #3a2a1a)' }}
          />
        </div>
      </div>
      </>
      )}

      {/* === 五部の装ひ === */}
      <div className="px-4 pt-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-black tracking-widest text-rw-ink">五部の装ひ</div>
          <button
            onClick={() => setShowRefs(true)}
            className="text-[10px] font-bold tracking-wider"
            style={{ color: 'var(--rw-primary)' }}
          >
            図解を見る →
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {(['head', 'robe', 'train', 'item', 'belt'] as PartKey[]).map((k) => {
            const lv = parts[k];
            const cap = PART_MAX_LV[k];
            const name = stage.display[k];
            const accent = k === 'robe' ? robeColorOf(name) : 'var(--rw-ink-soft)';
            return (
              <div
                key={k}
                className="bg-rw-paper border rounded text-center px-1 py-1.5"
                style={{
                  borderColor: 'rgba(106,82,53,0.2)',
                  borderTop: `3px solid ${accent}`,
                }}
                title={name}
              >
                <div className="text-[9px] tracking-widest text-rw-ink-soft">{PART_LABEL[k]}</div>
                <div className="text-base font-black text-rw-ink leading-none mt-1">
                  {lv}
                  <span className="text-[8px] text-rw-ink-soft font-normal">/{cap}</span>
                </div>
                <div className="mt-1 text-[8px] text-rw-ink-soft truncate leading-tight">
                  {name}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* === 次の昇進 === */}
      {next ? (
        <div
          className="mx-4 mt-3 px-3 py-2.5 flex items-center justify-between"
          style={{
            background: 'rgba(26,20,17,0.04)',
            borderLeft: `3px solid ${next.stage.milestone ? '#c9a25a' : tone.accent}`,
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[9px] tracking-widest text-rw-ink-soft">
              次 ・ 第 {next.stage.n} 階
            </div>
            <div
              className="text-sm font-black text-rw-ink truncate mt-0.5"
              style={{ fontFamily: '"Noto Serif JP", serif' }}
            >
              {next.stage.milestone && (
                <span style={{ color: '#c9a25a' }}>★ </span>
              )}
              {next.stage.rank}
              <span className="text-[10px] text-rw-ink-soft font-normal ml-1.5">
                {next.stage.post.split('・')[0]}
              </span>
            </div>
          </div>
          <div className="text-right text-[9px] text-rw-ink-soft tracking-wider shrink-0">
            <span className="text-xl font-black" style={{ color: tone.accent }}>
              {progress}
            </span>
            %<br />要 {next.blocking.length} パーツ
          </div>
        </div>
      ) : (
        <div className="mx-4 mt-3 px-3 py-2.5 text-center font-black text-sm" style={{ color: '#b58800' }}>
          👑 極位達成 — 太政大臣
        </div>
      )}

      {/* === 本日の学び (5 ジャンル) === */}
      <div className="px-4 pt-4">
        <div className="text-xs font-black tracking-widest text-rw-ink mb-2">本日の学び</div>
        <div className="flex flex-col">
          {GENRES.map((g) => {
            const lv = parts[g.part];
            const pct = lv / g.cap;
            return (
              <Link
                key={g.id}
                to={`/?chapter=${g.chapterId}`}
                className="flex items-center gap-2.5 py-2 border-b last:border-b-0 no-underline text-rw-ink hover:bg-rw-primary-soft/30 transition"
                style={{ borderColor: 'rgba(106,82,53,0.12)', textDecoration: 'none' }}
              >
                <div
                  className="w-6 h-6 flex items-center justify-center text-white font-black text-sm rounded-sm shrink-0"
                  style={{ background: g.color }}
                >
                  {g.kanji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-xs font-bold tracking-wide">{g.name}</span>
                    <span className="text-[10px] text-rw-ink-soft whitespace-nowrap">
                      Lv<b className="text-rw-ink text-xs font-black ml-0.5">{lv}</b>/{g.cap}
                    </span>
                  </div>
                  <div className="relative h-0.5 overflow-hidden" style={{ background: 'rgba(106,82,53,0.15)' }}>
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${pct * 100}%`, background: g.color }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-rw-ink-soft tracking-wider shrink-0">始める →</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* === 3 アクションボタン === */}
      <div className="px-4 py-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => setShowZukan(true)}
          className="py-2.5 text-[11px] font-black tracking-widest rounded text-rw-paper"
          style={{ background: 'var(--rw-ink)' }}
        >
          絵姿図鑑
        </button>
        <button
          onClick={() => setShowRoadmap(true)}
          className="py-2.5 text-[11px] font-black tracking-widest rounded text-rw-ink"
          style={{ background: 'transparent', border: '1px solid var(--rw-ink-soft)' }}
        >
          出世階梯
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className="py-2.5 text-[11px] font-black tracking-widest rounded text-rw-ink"
          style={{ background: 'transparent', border: '1px solid var(--rw-ink-soft)' }}
        >
          昇進履歴
        </button>
      </div>

      {showZukan && <ZukanModal currentStageN={stage.n} onClose={() => setShowZukan(false)} />}
      {showRefs && <RefsDrawer onClose={() => setShowRefs(false)} />}
      {showRoadmap && <RoadmapModal currentN={stage.n} onClose={() => setShowRoadmap(false)} />}
      {showHistory && <HistoryDrawer onClose={() => setShowHistory(false)} />}
    </div>
  );
}

// ── 絵姿図鑑モーダル — 全8幅 ──
function ZukanModal({ currentStageN, onClose }: { currentStageN: number; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,20,17,0.6)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[92vh] overflow-auto bg-rw-paper rounded-t-2xl px-4 pt-4 pb-6"
        style={{ boxShadow: '0 -8px 24px rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div
              className="text-lg font-black tracking-widest text-rw-ink"
              style={{ fontFamily: '"Noto Serif JP", serif' }}
            >
              絵姿図鑑
            </div>
            <div className="text-[9px] text-rw-ink-soft tracking-widest mt-1">
              全 八 幅 ・ 二十一階の絵姿
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[10px] font-bold tracking-wider border border-rw-ink-soft text-rw-ink rounded"
          >
            閉じる
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {PORTRAITS.map((p, i) => {
            const containsCurrent = currentStageN >= p.fromN && currentStageN <= p.toN;
            const isPast = currentStageN > p.toN;
            const unlocked = currentStageN >= p.fromN;
            return (
              <div
                key={i}
                className="flex gap-2.5 p-2"
                style={{
                  background: containsCurrent ? `${p.palette[2]}15` : 'rgba(255,255,255,0.4)',
                  border: containsCurrent
                    ? `2px solid ${p.palette[1]}`
                    : '1px solid rgba(106,82,53,0.2)',
                  opacity: unlocked ? 1 : 0.4,
                }}
              >
                <div
                  className="relative shrink-0 overflow-hidden"
                  style={{
                    width: 120,
                    background: '#f5ecd6',
                    border: '1px solid rgba(60,40,20,0.3)',
                    filter: unlocked ? 'none' : 'grayscale(1) blur(2px)',
                  }}
                >
                  <img src={p.src} alt={p.label} style={{ display: 'block', width: '100%', height: 'auto' }} />
                  {!unlocked && (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-white text-2xl font-black"
                      style={{ background: 'rgba(26,20,17,0.5)', fontFamily: '"Noto Serif JP", serif' }}
                    >
                      未
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-baseline gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold text-rw-ink-soft tracking-widest">
                      第 {i + 1} 幅
                    </span>
                    {containsCurrent && (
                      <span
                        className="text-[8px] font-black px-1.5 py-0.5 tracking-wider text-white"
                        style={{ background: p.palette[1] }}
                      >
                        現在
                      </span>
                    )}
                    {isPast && (
                      <span className="text-[8px] text-rw-ink-soft tracking-wider">済</span>
                    )}
                  </div>
                  <div
                    className="text-sm font-black tracking-wider leading-tight"
                    style={{ fontFamily: '"Noto Serif JP", serif', color: 'var(--rw-ink)' }}
                  >
                    {p.label}
                  </div>
                  <div className="text-[9px] text-rw-ink-soft tracking-wide mt-1 leading-relaxed">
                    {p.note}
                  </div>
                  <div className="flex-1" />
                  <div
                    className="mt-2 pt-1.5 border-t border-dashed flex items-center justify-between text-[9px] text-rw-ink-soft tracking-wider"
                    style={{ borderColor: 'rgba(106,82,53,0.25)' }}
                  >
                    <span>
                      {STAGES[p.fromN - 1].rank} 〜 {STAGES[p.toN - 1].rank}
                    </span>
                    <span>
                      第 {p.fromN} – {p.toN} 階
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 装束図解ドロワー — 5 部位チャート画像 ──
function RefsDrawer({ onClose }: { onClose: () => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const chart = PART_CHARTS[activeIdx];
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,20,17,0.6)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[88vh] overflow-auto bg-rw-paper rounded-t-2xl px-4 pt-4 pb-6"
        style={{ boxShadow: '0 -8px 24px rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div
              className="text-base font-black tracking-widest text-rw-ink"
              style={{ fontFamily: '"Noto Serif JP", serif' }}
            >
              装束図解
            </div>
            <div className="text-[9px] text-rw-ink-soft tracking-widest mt-1">
              五部の段階表
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[10px] font-bold tracking-wider border border-rw-ink-soft text-rw-ink rounded"
          >
            閉じる
          </button>
        </div>

        <div className="flex gap-1 mb-2.5">
          {PART_CHARTS.map((c, i) => (
            <button
              key={c.key}
              onClick={() => setActiveIdx(i)}
              className="flex-1 py-2 text-xs font-black tracking-wide border"
              style={{
                background: i === activeIdx ? 'var(--rw-ink)' : 'transparent',
                color: i === activeIdx ? 'var(--rw-paper)' : 'var(--rw-ink-soft)',
                borderColor: 'var(--rw-ink-soft)',
              }}
            >
              {c.label.split(' ・ ')[0]}
            </button>
          ))}
        </div>

        <div className="p-1.5 mb-2" style={{ background: '#f5ecd6', border: '1px solid rgba(60,40,20,0.3)' }}>
          <img src={chart.src} alt={chart.label} style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
        <div className="text-center text-xs text-rw-ink-soft tracking-wider">
          {chart.label}
          <span className="ml-2 text-rw-ink-soft/70">全 {chart.cap} 段</span>
        </div>
      </div>
    </div>
  );
}
