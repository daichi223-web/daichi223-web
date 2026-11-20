import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadLearningSnapshot, statsPageViewOf } from '@/lib/learningSnapshot';
import { readStreak, type StreakSnapshot } from '@/lib/streak';
import bundledKobunQ from '@/data/kobunQ.v2.slim.json';
import vocabIndex from '@/data/vocabIndex.json';
import { getQuizTypeCorrect, type QuizTypeStats } from '@/lib/quizTypeStats';
import {
  type FieldMastery,
  type ChapterId,
  VISIBLE_CHAPTERS,
  TIER_LABELS,
  TIER_KAII,
  computeTier as computeSharedTier,
  rankScoreOf,
} from '@/lib/fieldMastery';
import { partsFromFieldMastery } from '@/lib/nobleData';
import { readPeakTiers, updatePeakTiers } from '@/lib/peakTiers';
import NobleStatsDashboard from '@/components/noble/NobleStatsDashboard';
import NobleStatusBar from '@/components/noble/NobleStatusBar';
import ReiwaThemePicker from '@/theme/ReiwaThemePicker';
import BackupSection from '@/components/BackupSection';
import { chapterFor } from '@/utils/chapters';

// 段位バッジ用の色マッピング (★0-10 を 3 階層に分けて視覚化)
function tierBadge(tier: number): { bg: string; fg: string; tone: '無' | '地下' | '殿上' | '公卿' } {
  if (tier >= 7) return { bg: 'var(--rw-primary-soft)', fg: 'var(--rw-primary)', tone: '公卿' };
  if (tier >= 4) return { bg: 'var(--rw-accent-soft)', fg: 'var(--rw-accent)', tone: '殿上' };
  if (tier >= 1) return { bg: 'var(--rw-rule)', fg: 'var(--rw-ink-soft)', tone: '地下' };
  return { bg: 'transparent', fg: 'var(--rw-ink-soft)', tone: '無' };
}
import {
  isCoachOptedIn,
  setCoachOptIn,
  getCoachStatus,
  ensureDownloaded,
  destroySession,
  type CoachStatus,
} from '@/lib/nanoCoach';

// qid → lemma + sense マップを bundledKobunQ から構築
type LemmaIndex = Record<string, { lemma: string; sense: string; group: string | null }>;

function buildLemmaIndex(): LemmaIndex {
  const idx: LemmaIndex = {};
  for (const w of bundledKobunQ as Array<{ qid: string; lemma: string; sense: string; group?: string | number }>) {
    if (w?.qid && w.lemma) {
      idx[w.qid] = {
        lemma: w.lemma,
        sense: w.sense || '',
        group: w.group != null ? String(w.group) : null,
      };
    }
  }
  return idx;
}

type WordStat = { correct: number; incorrect: number; lastSeen: string };
type SrsBoxRow = { qid: string; box: number };

// === 練習量セクション 用の型・定数 ===

type GroupEntry = {
  group: number;
  lemma: string;
  category: string;
  qids: string[];
  correct: number;
  incorrect: number;
  total: number;
  mastered: boolean;
};

const VISIBLE_CHAPTER_IDS = new Set<ChapterId>(VISIBLE_CHAPTERS.map((c) => c.id));

export default function StatsPage() {
  const [stats, setStats] = useState<Record<string, WordStat>>({});
  const [weakQids, setWeakQids] = useState<string[]>([]);
  const [dueQids, setDueQids] = useState<string[]>([]);
  const [srsRows, setSrsRows] = useState<SrsBoxRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 見た目の設定（テーマ画面）。自分のキャラ（肖像）をタップで開く（2026-11-02）
  const [showLook, setShowLook] = useState(false);
  const [streak, setStreak] = useState<StreakSnapshot>({ current: 0, longest: 0, lastActiveDate: null });

  useEffect(() => {
    setStreak(readStreak());
  }, []);

  const lemmaIndex = useMemo(buildLemmaIndex, []);

  // group → 集計エントリ。stats 変化に応じて再計算
  const groupAgg = useMemo(() => {
    const m: Record<number, GroupEntry> = {};
    const vidx = vocabIndex as Record<string, { category?: string }>;
    for (const w of bundledKobunQ as Array<{ qid: string; lemma: string; group?: string | number }>) {
      const g = typeof w.group === 'number' ? w.group : Number(w.group);
      if (!Number.isFinite(g)) continue;
      if (!m[g]) {
        m[g] = {
          group: g,
          lemma: w.lemma,
          category: vidx[w.lemma]?.category ?? '?',
          qids: [],
          correct: 0,
          incorrect: 0,
          total: 0,
          mastered: false,
        };
      }
      m[g].qids.push(w.qid);
      const s = stats[w.qid];
      if (s) {
        m[g].correct += s.correct;
        m[g].incorrect += s.incorrect;
      }
    }
    for (const k of Object.keys(m)) {
      const e = m[Number(k)];
      e.total = e.correct + e.incorrect;
      e.mastered = e.total >= 5 && e.correct / e.total >= 0.8;
    }
    return m;
  }, [stats]);

  const allGroups = useMemo(
    () => Object.keys(groupAgg).map(Number).sort((a, b) => a - b),
    [groupAgg]
  );

  // 練習回数の分布 (5バケツ)
  const distribution = useMemo(() => {
    const buckets = { '0': 0, '1-2': 0, '3-5': 0, '6-10': 0, '11+': 0 };
    for (const g of allGroups) {
      const t = groupAgg[g].total;
      if (t === 0) buckets['0'] += 1;
      else if (t <= 2) buckets['1-2'] += 1;
      else if (t <= 5) buckets['3-5'] += 1;
      else if (t <= 10) buckets['6-10'] += 1;
      else buckets['11+'] += 1;
    }
    return buckets;
  }, [groupAgg, allGroups]);

  // 装束ダッシュボード用: 「Key & Point 古文単語330」5 章 (#1-330) のみ集計。
  // 13 段階マスタリ (古文常識・代表官職を位階順に。3 大階層):
  //   地下:  ★0 無位 / ★1 雑色 / ★2 舎人 / ★3 衛士
  //   殿上:  ★4 蔵人 / ★5 受領 / ★6 弁官 / ★7 中将 / ★8 頭中将
  //   公卿:  ★9 参議 / ★10 大将 / ★11 大納言 / ★12 大臣 (= マスター)
  // 詳細条件は computeTier() を参照。
  // ※ Box 5 = 14日後復習を突破 = 時間を空けて5連続正解の代理。
  // ※ 多義語が無い単語は多義条件を自動クリア扱い。
  const [quizTypeStats, setQuizTypeStats] = useState<QuizTypeStats>({});
  const srsBoxByQid = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of srsRows) m.set(r.qid, r.box);
    return m;
  }, [srsRows]);

  // 判定本体は fieldMastery.ts の computeTier (ホームと同じ条件)。
  function computeTier(g: GroupEntry): number {
    return computeSharedTier(g, quizTypeStats, srsBoxByQid);
  }

  // 各 group の peak-lock 後の段位を一元計算 (blueprintMetrics と tierBuckets で共通利用)。
  // 副作用: 現在 tier が peak を上回ったら localStorage 更新 (冪等)。
  const tierByGroup = useMemo(() => {
    const peaks = readPeakTiers();
    const updates: Array<{ group: number; tier: number }> = [];
    const out: Record<number, number> = {};
    for (const g of allGroups) {
      const ch = chapterFor(g);
      if (!ch || !VISIBLE_CHAPTER_IDS.has(ch.id as ChapterId)) {
        out[g] = 0;
        continue;
      }
      const currentTier = computeTier(groupAgg[g]);
      const peakTier = peaks[String(g)] ?? 0;
      if (currentTier > peakTier) updates.push({ group: g, tier: currentTier });
      out[g] = currentTier > peakTier ? currentTier : peakTier;
    }
    if (updates.length > 0) updatePeakTiers(updates);
    return out;
  }, [groupAgg, allGroups, quizTypeStats, srsBoxByQid]);

  const blueprintMetrics = useMemo(() => {
    const ids: ChapterId[] = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5'];
    type Acc = {
      total: number;
      jige: number;     // ★1-3 (地下)
      tenjou: number;   // ★4-6 (殿上人)
      kugyou: number;   // ★7-9 (公卿)
      master: number;   // ★9 (大納言 = マスター)
      tierSum: number;
    };
    const mkZero = (): Acc => ({ total: 0, jige: 0, tenjou: 0, kugyou: 0, master: 0, tierSum: 0 });
    const acc = { ch1: mkZero(), ch2: mkZero(), ch3: mkZero(), ch4: mkZero(), ch5: mkZero() } as Record<ChapterId, Acc>;
    let totalLearned = 0;
    let totalMastered = 0; // 「マスター」= ★9 大納言
    for (const g of allGroups) {
      const ch = chapterFor(g);
      if (!ch || !VISIBLE_CHAPTER_IDS.has(ch.id as ChapterId)) continue;
      const id = ch.id as ChapterId;
      const tier = tierByGroup[g] ?? 0; // peak-lock 済
      const a = acc[id];
      a.total += 1;
      a.tierSum += tier;
      if (tier >= 1) totalLearned += 1;
      if (tier >= 1 && tier <= 3) a.jige += 1;
      else if (tier >= 4 && tier <= 8) a.tenjou += 1;       // 殿上人: ★4-8
      else if (tier >= 9 && tier <= 12) a.kugyou += 1;       // 公卿: ★9-12
      if (tier === 12) {
        a.master += 1; // 「真のマスター」= 大臣 (おとど)
        totalMastered += 1;
      }
    }
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
    const fieldMastery = {} as FieldMastery;
    for (const id of ids) {
      const a = acc[id];
      fieldMastery[id] = {
        total: a.total,
        jigeCount: a.jige,
        tenjouCount: a.tenjou,
        kugyouCount: a.kugyou,
        masterCount: a.master,
        masteredPct: pct(a.master, a.total),
        // tier 範囲は 0..12 (13 段階)。avgTier / 12 で 0..1 正規化して 100 倍
        avgTierPct: a.total > 0 ? Math.round((a.tierSum / (a.total * 12)) * 100) : 0,
      };
    }
    const rankScore = rankScoreOf(
      allGroups
        .filter((g) => {
          const ch = chapterFor(g);
          return !!ch && VISIBLE_CHAPTER_IDS.has(ch.id as ChapterId);
        })
        .map((g) => tierByGroup[g] ?? 0)
    );
    return { totalLearned, totalMastered, fieldMastery, rankScore };
  }, [allGroups, tierByGroup]);

  const fieldMastery = blueprintMetrics.fieldMastery;

  // 段位別 単語数 (★0-12 のヒストグラム) と段位別 qid リスト (タップ→クイズ用)
  const tierBuckets = useMemo(() => {
    const counts = new Array(13).fill(0) as number[];
    const qidsByTier: string[][] = Array.from({ length: 13 }, () => []);
    for (const g of allGroups) {
      const ch = chapterFor(g);
      if (!ch || !VISIBLE_CHAPTER_IDS.has(ch.id as ChapterId)) continue;
      const tier = tierByGroup[g] ?? 0;
      counts[tier] += 1;
      for (const qid of groupAgg[g].qids) qidsByTier[tier].push(qid);
    }
    return { counts, qidsByTier };
  }, [groupAgg, allGroups, tierByGroup]);
  const tierDistribution = tierBuckets.counts;
  const tierQids = tierBuckets.qidsByTier;

  // 全体ハイブリッドスコア (桜・銀杏用)
  // よく練習した単語 Top 20
  const mostPracticed = useMemo(() => {
    return allGroups
      .map((g) => groupAgg[g])
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || b.correct - a.correct)
      .slice(0, 20);
  }, [groupAgg, allGroups]);

  // 単語クイズの記録: ページに戻ってきたら読み直す（読解の庭は /garden へ移した。2026-11-21）
  useEffect(() => {
    const refresh = () => setQuizTypeStats(getQuizTypeCorrect());
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 共通のまとめ読み（word_stats と srs_state を同時に1回ずつ。ホームから来たときは通信なし）
        const snapshot = await loadLearningSnapshot();
        if (cancelled) return;
        // 単語データから外した qid（欠番）の記録は、一覧にも件数にも出さない
        const v = statsPageViewOf(snapshot, Object.keys(lemmaIndex));
        setStats(v.stats);
        setWeakQids(v.weakQids);
        setDueQids(v.dueQids);
        setSrsRows(v.srsRows);
      } catch (e) {
        // silent fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lemmaIndex]);

  const overall = useMemo(() => {
    let answered = 0;
    let correct = 0;
    let mastered = 0;
    for (const v of Object.values(stats)) {
      const n = v.correct + v.incorrect;
      answered += n;
      correct += v.correct;
      if (n >= 5 && v.correct / n >= 0.8) mastered += 1;
    }
    return {
      answered,
      correct,
      mastered,
      uniqueWords: Object.keys(stats).length,
      accuracy: answered > 0 ? correct / answered : 0,
    };
  }, [stats]);

  const boxCounts = useMemo(() => {
    const c = [0, 0, 0, 0, 0]; // box 1〜5
    for (const r of srsRows) {
      if (r.box >= 1 && r.box <= 5) c[r.box - 1] += 1;
    }
    return c;
  }, [srsRows]);

  // 苦手 Top 20 (誤答数が多い順、attempts >= 2)
  const weakTop = useMemo(() => {
    return Object.entries(stats)
      .map(([qid, s]) => ({
        qid,
        correct: s.correct,
        incorrect: s.incorrect,
        total: s.correct + s.incorrect,
        errorRate: s.correct + s.incorrect > 0 ? s.incorrect / (s.correct + s.incorrect) : 0,
      }))
      .filter((r) => r.total >= 2 && r.errorRate >= 0.5)
      .sort((a, b) => b.incorrect - a.incorrect || b.errorRate - a.errorRate)
      .slice(0, 20);
  }, [stats]);

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-6">
          <Link to="/" className="text-sm text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← クイズに戻る
          </Link>
          <h1 className="text-2xl md:text-3xl font-black text-rw-ink mt-2 tracking-tight">学習履歴</h1>
          <p className="text-xs text-rw-ink-soft mt-1">
            これまでに挑戦した単語の累計と、SRS の進行状況
          </p>
        </header>

        {loading ? (
          <p className="text-rw-ink-soft text-center py-12">読み込み中...</p>
        ) : (
          <>
            {overall.answered === 0 && (
              <div className="bg-rw-paper border-2 border-rw-rule rounded-2xl p-4 mb-4 text-center">
                <div className="text-3xl mb-1">📊</div>
                <p className="text-rw-ink-soft text-xs">
                  まだ履歴がありません。クイズで答えると累計が記録されていきます。
                </p>
              </div>
            )}

            {/* ① 統合ステータスバー — 位階+次昇進+3 KPI を 1段に集約 (最上部、固定) */}
            <NobleStatusBar
              score={blueprintMetrics.rankScore}
              streak={streak.current}
              totalAnswered={overall.answered}
              masterCount={overall.mastered}
              linkToStats={false}
              onPortraitClick={() => setShowLook(true)}
            />
            <ReiwaThemePicker open={showLook} onClose={() => setShowLook(false)} />

            {/* ② 簡易表示 — 2 カード (挑戦単語 / 今日の復習)。累計正答率は単独セクションへ */}
            <section className="grid grid-cols-2 gap-2 mb-6">
              <SummaryCard
                label="挑戦単語"
                value={`${overall.uniqueWords}`}
                bg="var(--rw-primary-soft)"
                fg="var(--rw-primary)"
                to={
                  overall.uniqueWords > 0
                    ? `/?qid=${encodeURIComponent(Object.keys(stats).join(','))}`
                    : undefined
                }
                hint={overall.uniqueWords > 0 ? 'タップで復習' : undefined}
              />
              <SummaryCard
                label="今日の復習"
                value={`${dueQids.length}`}
                bg="color-mix(in srgb, var(--rw-tertiary) 25%, transparent)"
                fg="var(--rw-tertiary)"
              />
            </section>

            {/* ③ 装束ダッシュボード — 学習履歴の核 */}
            <section className="mb-6">
              <NobleStatsDashboard
                parts={partsFromFieldMastery(fieldMastery)}
                score={blueprintMetrics.rankScore}
                onOpenLook={() => setShowLook(true)}
              />
            </section>

            {/* 段位別 単語数 (★0-10 のヒストグラム) */}
            <section className="mb-6">
              <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
                段位別 単語数 ({tierDistribution.reduce((s, n) => s + n, 0)}語中)
              </h2>
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-3">
                {(() => {
                  const total = tierDistribution.reduce((s, n) => s + n, 0);
                  type Section = {
                    label: string;
                    desc: string;
                    tiers: number[];
                    bg: string;
                    accentColor: string;
                    elevated: boolean; // 殿上以上は強調
                  };
                  const sections: Section[] = [
                    {
                      label: '公卿 (上達部)', desc: '三位以上の議政官', tiers: [12, 11, 10, 9],
                      bg: 'color-mix(in srgb, var(--rw-primary) 12%, var(--rw-paper))',
                      accentColor: 'var(--rw-primary)',
                      elevated: true,
                    },
                    {
                      label: '殿上人', desc: '清涼殿に上がれる', tiers: [8, 7, 6, 5, 4],
                      bg: 'color-mix(in srgb, var(--rw-accent) 14%, var(--rw-paper))',
                      accentColor: 'var(--rw-accent)',
                      elevated: true,
                    },
                    {
                      label: '地下', desc: '殿上に上がれない下位', tiers: [3, 2, 1],
                      bg: 'transparent',
                      accentColor: 'var(--rw-ink-soft)',
                      elevated: false,
                    },
                    {
                      label: '未着手', desc: '未挑戦', tiers: [0],
                      bg: 'transparent',
                      accentColor: 'var(--rw-ink-soft)',
                      elevated: false,
                    },
                  ];
                  return sections.map((sec, secIdx) => {
                    const sumCount = sec.tiers.reduce((s, t) => s + tierDistribution[t], 0);
                    const isJigeBoundary = sec.label === '地下'; // 殿上人と地下の間で太い区切り
                    return (
                      <div
                        key={sec.label}
                        className={`rounded-xl px-2 py-2 ${secIdx > 0 ? 'mt-1.5' : ''} ${
                          isJigeBoundary ? 'border-t-[3px] border-rw-ink/15 pt-3 mt-2' : ''
                        }`}
                        style={{ background: sec.bg }}
                      >
                        <div className="flex items-baseline justify-between mb-1.5 px-1">
                          <div className="flex items-baseline gap-2">
                            <span
                              className="text-sm font-black tracking-wider"
                              style={{ color: sec.accentColor }}
                            >
                              {sec.label}
                            </span>
                            <span className="text-[10px] text-rw-ink-soft font-bold">
                              {sec.desc}
                            </span>
                          </div>
                          <span
                            className="text-xs font-black"
                            style={{ color: sec.accentColor }}
                          >
                            {sumCount}<span className="text-[10px] text-rw-ink-soft ml-0.5">語</span>
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {sec.tiers.map((tier) => {
                            const count = tierDistribution[tier];
                            const pct = total > 0 ? (count / total) * 100 : 0;
                            const badge = tierBadge(tier);
                            const qids = tierQids[tier];
                            const tappable = count > 0 && qids.length > 0;
                            // 殿上以上は文字 / バー大きめ、地下は controlled smaller
                            const fontWeight = sec.elevated ? 'text-[13px]' : 'text-xs';
                            const barH = sec.elevated ? 'h-2.5' : 'h-1.5';
                            const rowInner = (
                              <div className={`flex items-center gap-2 py-0.5 ${sec.elevated ? '' : 'opacity-80'}`}>
                                <span className="text-[10px] font-mono text-rw-ink-soft w-7 shrink-0">★{tier}</span>
                                <span className={`${fontWeight} font-bold w-14 shrink-0`} style={{ color: badge.fg }}>
                                  {TIER_LABELS[tier]}
                                </span>
                                <span className="text-[9px] text-rw-ink-soft font-mono w-16 shrink-0 truncate">
                                  {TIER_KAII[tier]}
                                </span>
                                <div className={`flex-1 ${barH} rounded-full bg-rw-rule/40 overflow-hidden`}>
                                  <div className="h-full rounded-full transition-all"
                                       style={{ width: `${Math.max(pct, count > 0 ? 1.5 : 0)}%`, background: badge.fg }} />
                                </div>
                                <span className={`${fontWeight} font-black text-rw-ink w-10 text-right shrink-0`}>
                                  {count}
                                </span>
                                <span className="text-[10px] text-rw-ink-soft w-4 shrink-0 text-right">
                                  {tappable ? '▶' : ''}
                                </span>
                              </div>
                            );
                            return tappable ? (
                              <Link
                                key={tier}
                                to={`/?qid=${encodeURIComponent(qids.join(','))}`}
                                className="block px-1 -mx-1 rounded hover:bg-rw-paper active:scale-[0.99] transition no-underline"
                                title={`★${tier} ${TIER_LABELS[tier]} の ${count} 語をクイズに出題`}
                              >
                                {rowInner}
                              </Link>
                            ) : (
                              <div key={tier}>{rowInner}</div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>

            {/* ⑤ ヒートマップ */}
            <section className="mb-6">
              <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
                ヒートマップ
              </h2>
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[11px] font-bold text-rw-ink">
                    全 {allGroups.length} 語ヒートマップ
                  </div>
                  <div className="text-[9px] text-rw-ink-soft">タップで復習</div>
                </div>
                <Heatmap groups={allGroups.map((g) => groupAgg[g])} />
                <HeatmapLegend />
              </div>
            </section>

            {/* ⑥ 練習頻度の分布 */}
            <section className="mb-6">
              <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
                練習頻度の分布
              </h2>
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[11px] font-bold text-rw-ink">
                    挑戦回数別の単語数
                  </div>
                  <div className="text-[10px] text-rw-ink-soft">
                    着手 <b className="text-rw-ink text-sm font-black">{allGroups.length - distribution['0']}</b>
                    <span className="text-[9px] ml-0.5">/ 全{allGroups.length}語</span>
                  </div>
                </div>
                <DistributionBars distribution={distribution} total={allGroups.length} />
              </div>
            </section>

            {/* ⑦ 累計正答率 — 単独セクションで強調表示 */}
            <section className="mb-6">
              <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
                累計正答率
              </h2>
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4 flex items-baseline justify-between">
                <div>
                  <div className="text-4xl font-black leading-none" style={{ color: 'var(--rw-accent)' }}>
                    {Math.round(overall.accuracy * 100)}<span className="text-xl">%</span>
                  </div>
                  <div className="text-[10px] text-rw-ink-soft mt-1.5">
                    全クイズ累計 ({overall.correct.toLocaleString()} / {overall.answered.toLocaleString()} 問)
                  </div>
                </div>
                <div className="text-right text-[10px] text-rw-ink-soft">
                  <div>過去 acc は変動表示</div>
                  <div>段位は <b className="text-rw-ink">peak-lock</b></div>
                </div>
              </div>
            </section>

            {/* ⑧ 読解の庭 */}
            <section className="mb-6">
              <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
                読解の庭
              </h2>
              <Link
                to="/garden"
                className="flex items-center justify-between gap-3 bg-rw-paper border border-rw-rule rounded-2xl p-4 no-underline text-rw-ink"
              >
                <span className="flex items-center gap-3">
                  <img src="/garden/plants/sakura-5.webp" width={52} height={52} alt="" className="shrink-0" />
                  <span>
                    <span className="block text-sm font-black">荒れた院をよみがえらせる</span>
                    <span className="block text-[11px] text-rw-ink-soft mt-0.5">読解テストで教材の草木を育て、花を咲かせよう</span>
                  </span>
                </span>
                <span className="text-xs text-rw-ink-soft shrink-0">開く →</span>
              </Link>
            </section>

            {/* 連続学習 (longest のみ — 現在連続はバーに集約済) */}
            {streak.longest > 0 && (
              <section className="mb-6">
                <div className="bg-rw-paper border border-rw-rule rounded-xl px-4 py-2.5 flex items-center justify-between text-[11px] text-rw-ink-soft">
                  <span>
                    最長連続記録{' '}
                    <b className="text-base text-rw-ink font-black ml-1">{streak.longest}</b>
                    <span className="ml-0.5">日</span>
                  </span>
                  {streak.lastActiveDate && (
                    <span className="font-mono">最終学習: {streak.lastActiveDate}</span>
                  )}
                </div>
              </section>
            )}

            {/* SRS box 分布 */}
            <section className="mb-6">
              <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
                SRS 進行状況
              </h2>
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4">
                <div className="flex items-end gap-1 h-24">
                  {boxCounts.map((count, i) => {
                    const max = Math.max(...boxCounts, 1);
                    const heightPct = (count / max) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <div className="text-[10px] text-rw-ink-soft font-bold">{count}</div>
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: `${Math.max(heightPct, 2)}%`,
                            background: `var(--layer-${i + 1})`,
                          }}
                        />
                        <div className="text-[10px] text-rw-ink-soft font-bold">B{i + 1}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-[11px] text-rw-ink-soft text-center">
                  Box 1: 毎回復習 · Box 2: 1日後 · Box 3: 3日後 · Box 4: 7日後 · Box 5: 14日後
                </div>
              </div>
            </section>

            {/* 苦手 Top 20 */}
            {weakTop.length > 0 && (
              <section className="mb-6">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase">
                    苦手な単語 Top {weakTop.length} ({weakQids.length}語中)
                  </h2>
                  {weakQids.length > 0 && (
                    <Link
                      to={`/?qid=${encodeURIComponent(weakQids.join(','))}`}
                      className="text-[11px] font-black px-3 py-1 rounded-full no-underline transition-colors"
                      style={{
                        background: 'var(--rw-ink)',
                        color: 'var(--rw-paper)',
                      }}
                      title="苦手単語をまとめてクイズで復習"
                    >
                      全部復習 ▶
                    </Link>
                  )}
                </div>
                <div className="space-y-1.5">
                  {weakTop.map((row) => {
                    const meta = lemmaIndex[row.qid];
                    return (
                      <div
                        key={row.qid}
                        className="bg-rw-paper border border-rw-rule rounded-xl px-3 py-2.5 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-rw-ink truncate text-sm">
                            {meta?.lemma ?? row.qid}
                            {meta?.sense && (
                              <span className="text-rw-ink-soft font-normal text-xs ml-2">
                                {meta.sense}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-rw-ink-soft mt-0.5">
                            正解 {row.correct} / 誤答 {row.incorrect} (誤答率 {Math.round(row.errorRate * 100)}%)
                          </div>
                        </div>
                        {/* 誤答率バー */}
                        <div className="w-16 h-2 rounded-full overflow-hidden bg-rw-rule shrink-0">
                          <div
                            className="h-full bg-rw-primary"
                            style={{ width: `${Math.round(row.errorRate * 100)}%` }}
                          />
                        </div>
                        {/* この語だけ復習 */}
                        <Link
                          to={`/?qid=${encodeURIComponent(row.qid)}`}
                          className="text-[10px] font-black rounded-full px-2 py-1 shrink-0 no-underline"
                          style={{ background: 'var(--rw-ink)', color: 'var(--rw-paper)' }}
                          title={`「${meta?.lemma ?? row.qid}」だけ復習`}
                        >
                          🔁
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* よく練習した単語 Top 20 */}
            {mostPracticed.length > 0 && (
              <section className="mb-6">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase">
                    よく練習した単語 Top {mostPracticed.length}
                  </h2>
                </div>
                <div className="space-y-1.5">
                  {mostPracticed.map((row) => {
                    const accuracy = row.total > 0 ? row.correct / row.total : 0;
                    const tier = computeTier(row);
                    const badge = tierBadge(tier);
                    return (
                      <Link
                        key={row.group}
                        to={`/?qid=${encodeURIComponent(row.qids.join(','))}`}
                        className="bg-rw-paper border border-rw-rule rounded-xl px-3 py-2.5 flex items-center gap-3 no-underline text-rw-ink hover:bg-rw-primary-soft active:scale-[0.99] transition cursor-pointer"
                        title={`「${row.lemma}」のクイズへ`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-rw-ink truncate text-sm flex items-center gap-1.5">
                            {row.lemma}
                            <span
                              className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: badge.bg, color: badge.fg }}
                              title={`★${tier} ${TIER_LABELS[tier]} (${badge.tone})`}
                            >
                              ★{tier} {TIER_LABELS[tier]}
                            </span>
                          </div>
                          <div className="text-[10px] text-rw-ink-soft mt-0.5">
                            {row.category} · 正解 {row.correct} / 誤答 {row.incorrect} (正答率 {Math.round(accuracy * 100)}%)
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-black text-rw-ink leading-none">
                            {row.total}
                          </div>
                          <div className="text-[9px] text-rw-ink-soft font-bold">回</div>
                        </div>
                        <span
                          className="text-[10px] font-black rounded-full px-2 py-1 shrink-0"
                          style={{ background: 'var(--rw-ink)', color: 'var(--rw-paper)' }}
                          aria-hidden="true"
                        >
                          🔁
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <CoachSettingsSection />

            <BackupSection />

            <section>
              <p className="text-[11px] text-rw-ink-soft text-center mt-6">
                履歴は同じ端末・同じブラウザで継続されます。
                <br />
                端末を変えるときや、ブラウザデータを消す前に
                上の「エクスポート」で JSON を保存しておいてください。
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  bg,
  fg,
  hintTone,
  to,
  hint,
}: {
  label: string;
  value: string;
  bg: string;
  fg: string;
  hintTone?: number;
  to?: string;     // 指定すると Link 化してクイズ等へ遷移可能に
  hint?: string;   // 右下に小さく「タップで…」表示
}) {
  const inner = (
    <>
      <div className="text-[10px] tracking-wider font-bold uppercase text-rw-ink-soft">
        {label}
      </div>
      <div className="text-3xl font-black mt-1" style={{ color: fg }}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-rw-ink-soft mt-1 font-bold">{hint} ▶</div>
      )}
    </>
  );
  const baseClass = 'rounded-2xl p-4 border border-rw-rule block';
  const style = { background: bg, opacity: hintTone ?? 1 };
  if (to) {
    return (
      <Link to={to} className={baseClass + ' no-underline hover:brightness-95 active:scale-[0.98] transition cursor-pointer'} style={{ ...style, color: fg }}>
        {inner}
      </Link>
    );
  }
  return <div className={baseClass} style={style}>{inner}</div>;
}

// ── AI コーチ (Gemini Nano) 設定 ──
// 既定 OFF。トグル ON 時に状態判定→ DL 必要なら明示ボタン。
function CoachSettingsSection() {
  const [opted, setOpted] = useState<boolean>(() => isCoachOptedIn());
  const [status, setStatus] = useState<CoachStatus>('unsupported');
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!opted) return;
    let cancelled = false;
    getCoachStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [opted]);

  const toggle = () => {
    const next = !opted;
    setCoachOptIn(next);
    setOpted(next);
    if (!next) {
      destroySession();
      setProgress(null);
    }
  };

  const startDownload = async () => {
    setProgress(0);
    setStatus('downloading');
    const newStatus = await ensureDownloaded((r) => setProgress(r));
    setStatus(newStatus);
    setProgress(null);
  };

  return (
    <section className="mb-6">
      <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
        AI コーチ（実験機能）
      </h2>
      <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-black text-rw-ink">
              記述クイズに AI コメント
            </div>
            <div className="text-[11px] text-rw-ink-soft mt-0.5">
              Chrome 内蔵モデルで動く / オフライン / 無料 / 採点スコアには影響しません
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="shrink-0 px-4 py-1.5 rounded-full font-black text-xs"
            style={{
              background: opted ? 'var(--rw-accent)' : 'var(--rw-paper)',
              color: opted ? 'var(--rw-paper)' : 'var(--rw-ink-soft)',
              border: `2px solid ${opted ? 'var(--rw-accent)' : 'var(--rw-rule)'}`,
            }}
            aria-pressed={opted}
          >
            {opted ? 'ON' : 'OFF'}
          </button>
        </div>
        {opted && (
          <div className="mt-3 text-[11px]">
            {status === 'unsupported' && (
              <p className="text-rw-ink-soft">
                この Chrome では未対応です。Chrome 138 以降にアップデートすると使えます。
              </p>
            )}
            {status === 'unavailable' && (
              <p className="text-rw-ink-soft">
                この端末では利用できません（GPU/メモリ要件不足）。
              </p>
            )}
            {status === 'downloadable' && (
              <button
                type="button"
                onClick={startDownload}
                className="px-3 py-1.5 rounded-full font-black text-[11px]"
                style={{ background: 'var(--rw-ink)', color: 'var(--rw-paper)' }}
              >
                モデルをダウンロード（約 2 GB）
              </button>
            )}
            {status === 'downloading' && (
              <p className="text-rw-ink-soft">
                ダウンロード中...
                {progress != null && ` ${Math.round(progress * 100)}%`}
              </p>
            )}
            {status === 'available' && (
              <p className="font-bold" style={{ color: 'var(--rw-accent)' }}>
                ✓ 準備完了
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DistributionBars({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  const entries: Array<[string, number, string]> = [
    ['0', distribution['0'] || 0, '#cfcfcf'],
    ['1-2', distribution['1-2'] || 0, 'color-mix(in srgb, var(--rw-primary) 35%, transparent)'],
    ['3-5', distribution['3-5'] || 0, 'color-mix(in srgb, var(--rw-primary) 55%, transparent)'],
    ['6-10', distribution['6-10'] || 0, 'color-mix(in srgb, var(--rw-primary) 75%, transparent)'],
    ['11+', distribution['11+'] || 0, 'var(--rw-primary)'],
  ];
  return (
    <div>
      <div className="flex w-full h-3 rounded-full overflow-hidden border border-rw-rule">
        {entries.map(([label, count, color]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={label}
              style={{ width: `${pct}%`, background: color }}
              title={`${label}回: ${count}語`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[9px] text-rw-ink-soft font-bold">
        {entries.map(([label, count, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm border border-black/10"
              style={{ background: color }}
            />
            <span>{label}回</span>
            <span className="text-rw-ink">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function heatColor(total: number): string {
  if (total === 0) return 'rgba(140,140,140,0.18)';
  if (total <= 2) return 'color-mix(in srgb, var(--rw-primary) 30%, transparent)';
  if (total <= 5) return 'color-mix(in srgb, var(--rw-primary) 55%, transparent)';
  if (total <= 10) return 'color-mix(in srgb, var(--rw-primary) 78%, transparent)';
  return 'var(--rw-primary)';
}

function Heatmap({ groups }: { groups: GroupEntry[] }) {
  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: 'repeat(23, minmax(0, 1fr))' }}
    >
      {groups.map((g) => {
        const bg = heatColor(g.total);
        const ringStyle = g.mastered
          ? { boxShadow: 'inset 0 0 0 2px var(--rw-accent)' }
          : undefined;
        return (
          <Link
            key={g.group}
            to={`/?qid=${encodeURIComponent(g.qids.join(','))}`}
            title={`${g.lemma} (${g.category}) · 練習${g.total}回 / 正解${g.correct}・誤答${g.incorrect}${g.mastered ? ' · MASTER' : ''}`}
            className="aspect-square rounded-[3px] no-underline transition-transform hover:scale-110"
            style={{ background: bg, ...ringStyle }}
            aria-label={`${g.lemma}: 練習${g.total}回`}
          />
        );
      })}
    </div>
  );
}

function HeatmapLegend() {
  const items: Array<[string, string]> = [
    ['0', 'rgba(140,140,140,0.18)'],
    ['1-2', 'color-mix(in srgb, var(--rw-primary) 30%, transparent)'],
    ['3-5', 'color-mix(in srgb, var(--rw-primary) 55%, transparent)'],
    ['6-10', 'color-mix(in srgb, var(--rw-primary) 78%, transparent)'],
    ['11+', 'var(--rw-primary)'],
  ];
  return (
    <div className="flex items-center justify-center gap-2 mt-3 text-[9px] text-rw-ink-soft font-bold">
      <span>少</span>
      {items.map(([label, color]) => (
        <div
          key={label}
          className="w-3.5 h-3.5 rounded-[3px] border border-black/10"
          style={{ background: color }}
          title={`${label}回`}
        />
      ))}
      <span>多</span>
      <span className="ml-2 inline-flex items-center gap-1">
        <span
          className="inline-block w-3.5 h-3.5 rounded-[3px]"
          style={{ boxShadow: 'inset 0 0 0 2px var(--rw-accent)', background: 'transparent' }}
        />
        MASTER
      </span>
    </div>
  );
}
