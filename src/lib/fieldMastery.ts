// 5 章 × 13 段マスタリ計算 — StatsPage / NobleStatsDashboard / NobleHomeWidget 共通の集計ロジック。
// 「Key & Point 古文単語330」の章 ch1-ch5 のみを集計対象とする (ext は除外)。
// 段位は古文常識の代表官職を位階順に並べた 13 段階 (★0-12):
//   地下:  ★0 無位 / ★1 雑色 / ★2 舎人 / ★3 衛士
//   殿上:  ★4 蔵人 / ★5 受領 / ★6 弁官 / ★7 中将 / ★8 頭中将
//   公卿:  ★9 参議 / ★10 大将 / ★11 大納言 / ★12 大臣 (= 真のマスター)

import { useEffect, useMemo, useState } from 'react';
import bundledKobunQ from '@/data/kobunQ.json';
import vocabIndex from '@/data/vocabIndex.json';
import { getWordStats } from '@/lib/wordStats';
import { getQuizTypeCorrect, type QuizTypeStats } from '@/lib/quizTypeStats';
import { supabase } from '@/lib/supabase';
import { currentAuthUid } from '@/lib/anonAuth';
import { CHAPTERS, chapterFor } from '@/utils/chapters';

export type ChapterId = 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5';

export const VISIBLE_CHAPTERS = CHAPTERS.filter((c) => c.id !== 'ext') as Array<
  typeof CHAPTERS[number] & { id: ChapterId }
>;
const VISIBLE_CHAPTER_IDS = new Set<ChapterId>(VISIBLE_CHAPTERS.map((c) => c.id));

// 単語の段位 ★0-12 を 21 階位の代表的な階位・官職にマッピング。
// 階層: 地下 (★0-3) → 殿上人 (★4-8) → 公卿 (★9-12)
//   ★0  = 無位  (stage 1)
//   ★1  = 八位  (stage 2)
//   ★2  = 七位  (stage 3)
//   ★3  = 六位  (stages 4-7)            ──── 地下ここまで
//   ★4  = 従五下 (stage 8、殿上人デビュー)
//   ★5  = 従五上 (stage 9)
//   ★6  = 正五   (stages 10-11)
//   ★7  = 従四   (stages 12-13)
//   ★8  = 正四   (stages 14-15)         ──── 殿上人ここまで
//   ★9  = 従三   (stage 16、公卿デビュー)
//   ★10 = 正三   (stage 17)
//   ★11 = 二位   (stages 18-19)
//   ★12 = 一位   (stages 20-21、太政大臣 = 真のマスター)
export const TIER_LABELS = [
  '無位', '八位', '七位', '六位',
  '従五下', '従五上', '正五', '従四', '正四',
  '従三', '正三', '二位', '一位',
] as const;

// 対応する代表官職 (21 階位表の post から代表を選抜)
export const TIER_KAII = [
  '', '少録', '大允', '国守',
  '少納言', '侍従', '近衛少将', '近衛中将', '参議',
  '中納言', '大納言', '内大臣', '太政大臣',
] as const;

export type ChapterStats = {
  total: number;
  jigeCount: number;
  tenjouCount: number;
  kugyouCount: number;
  masterCount: number;
  masteredPct: number;
  avgTierPct: number;
};

export type FieldMastery = Record<ChapterId, ChapterStats>;

type GroupEntry = {
  group: number;
  qids: string[];
  correct: number;
  total: number;
};

type WordStat = { correct: number; incorrect: number };
type SrsBoxRow = { qid: string; box: number };

// 単語グループの ★0-12 段位を計算 (StatsPage と同一ロジック)
export function computeTier(
  g: GroupEntry,
  quizTypeStats: QuizTypeStats,
  srsBoxByQid: Map<string, number>
): number {
  const { total, correct, qids } = g;
  if (correct < 1) return 0;
  const acc = total > 0 ? correct / total : 0;
  const isPolysemous = qids.length > 1;
  let polysemyCorrect = 0;
  let writingCorrect = 0;
  let maxBox = 0;
  for (const qid of qids) {
    const r = quizTypeStats[qid];
    if (r?.polysemy) polysemyCorrect += r.polysemy;
    if (r?.writing) writingCorrect += r.writing;
    const b = srsBoxByQid.get(qid);
    if (b != null && b > maxBox) maxBox = b;
  }
  if (total >= 85 && acc >= 0.95 && (!isPolysemous || polysemyCorrect >= 5) && writingCorrect >= 7 && maxBox >= 5) return 12;
  if (total >= 65 && acc >= 0.9  && (!isPolysemous || polysemyCorrect >= 3) && writingCorrect >= 4 && maxBox >= 5) return 11;
  if (total >= 50 && acc >= 0.9  && (!isPolysemous || polysemyCorrect >= 2) && writingCorrect >= 3 && maxBox >= 4) return 10;
  if (total >= 40 && acc >= 0.85 && (!isPolysemous || polysemyCorrect >= 2) && writingCorrect >= 2 && maxBox >= 3) return 9;
  if (total >= 32 && acc >= 0.85 && (!isPolysemous || polysemyCorrect >= 1) && writingCorrect >= 2 && maxBox >= 3) return 8;
  if (total >= 25 && acc >= 0.85 && (!isPolysemous || polysemyCorrect >= 1) && writingCorrect >= 1 && maxBox >= 3) return 7;
  if (total >= 20 && acc >= 0.8  && (polysemyCorrect >= 1 || writingCorrect >= 1)) return 6;
  if (total >= 15 && acc >= 0.8) return 5;
  if (total >= 10 && acc >= 0.75) return 4;
  if (total >= 5  && acc >= 0.7)  return 3;
  if (total >= 3) return 2;
  return 1;
}

export type FieldMasteryResult = {
  fieldMastery: FieldMastery;
  totalLearned: number;
  totalMastered: number;
};

// 純粋関数: 集計済データから fieldMastery を計算
export function computeFieldMastery(
  stats: Record<string, WordStat>,
  quizTypeStats: QuizTypeStats,
  srsRows: SrsBoxRow[]
): FieldMasteryResult {
  const srsBoxByQid = new Map<string, number>();
  for (const r of srsRows) srsBoxByQid.set(r.qid, r.box);

  // group → entry 構築
  const m: Record<number, GroupEntry> = {};
  for (const w of bundledKobunQ as Array<{ qid: string; group?: string | number }>) {
    const g = typeof w.group === 'number' ? w.group : Number(w.group);
    if (!Number.isFinite(g)) continue;
    if (!m[g]) m[g] = { group: g, qids: [], correct: 0, total: 0 };
    m[g].qids.push(w.qid);
    const s = stats[w.qid];
    if (s) {
      m[g].correct += s.correct;
      m[g].total += s.correct + s.incorrect;
    }
  }
  const groups = Object.values(m);

  // 章ごと集計
  type Acc = { total: number; jige: number; tenjou: number; kugyou: number; master: number; tierSum: number };
  const mk = (): Acc => ({ total: 0, jige: 0, tenjou: 0, kugyou: 0, master: 0, tierSum: 0 });
  const acc: Record<ChapterId, Acc> = {
    ch1: mk(), ch2: mk(), ch3: mk(), ch4: mk(), ch5: mk(),
  };
  let totalLearned = 0;
  let totalMastered = 0;

  for (const g of groups) {
    const ch = chapterFor(g.group);
    if (!ch || !VISIBLE_CHAPTER_IDS.has(ch.id as ChapterId)) continue;
    const id = ch.id as ChapterId;
    const tier = computeTier(g, quizTypeStats, srsBoxByQid);
    const a = acc[id];
    a.total += 1;
    a.tierSum += tier;
    if (tier >= 1) totalLearned += 1;
    if (tier >= 1  && tier <= 3)  a.jige += 1;
    else if (tier >= 4 && tier <= 8) a.tenjou += 1;
    else if (tier >= 9 && tier <= 12) a.kugyou += 1;
    if (tier === 12) {
      a.master += 1;
      totalMastered += 1;
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const fieldMastery = {} as FieldMastery;
  (['ch1', 'ch2', 'ch3', 'ch4', 'ch5'] as ChapterId[]).forEach((id) => {
    const a = acc[id];
    fieldMastery[id] = {
      total: a.total,
      jigeCount: a.jige,
      tenjouCount: a.tenjou,
      kugyouCount: a.kugyou,
      masterCount: a.master,
      masteredPct: pct(a.master, a.total),
      avgTierPct: a.total > 0 ? Math.round((a.tierSum / (a.total * 12)) * 100) : 0,
    };
  });

  return { fieldMastery, totalLearned, totalMastered };
}

// 初期値 (loading 中に使う)
export const EMPTY_FIELD_MASTERY: FieldMastery = {
  ch1: { total: 0, jigeCount: 0, tenjouCount: 0, kugyouCount: 0, masterCount: 0, masteredPct: 0, avgTierPct: 0 },
  ch2: { total: 0, jigeCount: 0, tenjouCount: 0, kugyouCount: 0, masterCount: 0, masteredPct: 0, avgTierPct: 0 },
  ch3: { total: 0, jigeCount: 0, tenjouCount: 0, kugyouCount: 0, masterCount: 0, masteredPct: 0, avgTierPct: 0 },
  ch4: { total: 0, jigeCount: 0, tenjouCount: 0, kugyouCount: 0, masterCount: 0, masteredPct: 0, avgTierPct: 0 },
  ch5: { total: 0, jigeCount: 0, tenjouCount: 0, kugyouCount: 0, masterCount: 0, masteredPct: 0, avgTierPct: 0 },
};

// HomeReiwa / NobleHomeWidget 用フック: 内部で wordStats / SRS / quizTypeStats を取得し
// fieldMastery と累計を返す。loading=true 中は EMPTY_FIELD_MASTERY を返す。
export function useFieldMastery(): FieldMasteryResult & { loading: boolean; totalAnswered: number } {
  const [stats, setStats] = useState<Record<string, WordStat>>({});
  const [srsRows, setSrsRows] = useState<SrsBoxRow[]>([]);
  const [quizTypeStats, setQuizTypeStats] = useState<QuizTypeStats>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getWordStats();
        if (cancelled) return;
        setStats(s);
        setQuizTypeStats(getQuizTypeCorrect());
        const userId = (await currentAuthUid()) ?? '';
        if (userId) {
          const { data } = await supabase
            .from('srs_state')
            .select('qid, box')
            .eq('user_id', userId);
          if (!cancelled) setSrsRows((data ?? []) as SrsBoxRow[]);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(
    () => computeFieldMastery(stats, quizTypeStats, srsRows),
    [stats, quizTypeStats, srsRows]
  );

  const totalAnswered = useMemo(() => {
    let n = 0;
    for (const v of Object.values(stats)) n += v.correct + v.incorrect;
    return n;
  }, [stats]);

  return { ...result, totalAnswered, loading };
}
