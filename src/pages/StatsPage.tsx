import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getWordStats, getWeakWords } from '@/lib/wordStats';
import { getDueWords } from '@/lib/srsEngine';
import { readStreak, type StreakSnapshot } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { currentAuthUid } from '@/lib/anonAuth';
import bundledKobunQ from '@/data/kobunQ.json';
import vocabIndex from '@/data/vocabIndex.json';
import bundledTextsV3 from '@/data/textsV3Index.json';
import { loadAllProgress, getOpenCounters } from '@/lib/kobun/progress';
import { getQuizTypeCorrect, type QuizTypeStats } from '@/lib/quizTypeStats';
import { getPublishedSlugs } from '@/lib/textPublications';
import { hasFullAccess } from '@/lib/fullAccess';

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

type CharacterTheme = 'garden' | 'robot';
const CHARACTER_THEME_KEY = 'kobun-tan:dashboard-character-theme';

// ロボット部位用 7段階しきい値 (より厳しめ)
// 多義語・記述クイズも組み合わせないと Lv7 (金) には到達しないように設定
function stageFromRobotScore(score: number): number {
  if (score >= 0.92) return 6;
  if (score >= 0.80) return 5;
  if (score >= 0.60) return 4;
  if (score >= 0.40) return 3;
  if (score >= 0.20) return 2;
  if (score >= 0.05) return 1;
  return 0;
}

// === 庭(Garden) — 1作品=1株。ジャンル別樹種 × 7段階成長 ===
// 成長指標は「読書進度 + 単語解説/トークンヒント開閉数」のシークレット式
type PlantSpecies = {
  key: string;
  name: string;
  // 7段階の絵文字 (Lv0=種 〜 Lv6=最大)
  stages: string[];
};

const PLANT_SAKURA: PlantSpecies = {
  key: 'sakura',
  name: '桜',
  stages: ['🟫', '🌱', '🌿', '🟢', '🌸', '🌺', '🌸✨'],
};
const PLANT_GINKGO: PlantSpecies = {
  key: 'ginkgo',
  name: '銀杏',
  stages: ['🟫', '🌰', '🌱', '🌿', '🍃', '🍂', '🌳'],
};
const PLANT_KUSU: PlantSpecies = {
  key: 'kusu',
  name: '楠',
  stages: ['🟫', '🌱', '🌿', '🌳', '🌳', '🌲', '🌳✨'],
};
const PLANT_MOMIJI: PlantSpecies = {
  key: 'momiji',
  name: '楓',
  stages: ['🟫', '🌱', '🌿', '🍂', '🍁', '🍁🍁', '🍁✨'],
};
const PLANT_UME: PlantSpecies = {
  key: 'ume',
  name: '梅',
  stages: ['🟫', '🌱', '🌿', '🟢', '🟣', '🌷', '🌷✨'],
};
const PLANT_SUNFLOWER: PlantSpecies = {
  key: 'sunflower',
  name: '向日葵',
  stages: ['🟫', '🌱', '🌿', '💚', '🌻', '🌻🌻', '🌻✨'],
};

// ジャンル → 樹種
function speciesForText(genre: string | undefined): PlantSpecies {
  switch (genre) {
    case '物語': return PLANT_SAKURA;
    case '随筆': return PLANT_GINKGO;
    case '日記': return PLANT_GINKGO;
    case '説話': return PLANT_KUSU;
    case '軍記': return PLANT_MOMIJI;
    case '和歌': return PLANT_UME;
    case '歌物語': return PLANT_UME;
    default: return PLANT_SUNFLOWER;
  }
}

type TextV3Entry = {
  id: string;
  title: string;
  source?: string;
  genre?: string;
  era?: string;
  difficulty?: number;
};

type GardenPlant = {
  id: string;
  title: string;
  source: string;
  genre: string;
  species: PlantSpecies;
  level: number; // 0..6
  // 内部スコアはシークレット (UI には出さない)
};

// ロボット部品: カテゴリ → 部位
const ROBOT_PARTS: Array<{ key: string; label: string; categories: string[] }> = [
  { key: 'head', label: '頭部', categories: ['敬語動詞'] },
  { key: 'body', label: '胴体', categories: ['重要動詞'] },
  { key: 'rarm', label: '右腕', categories: ['重要形容詞'] },
  { key: 'larm', label: '左腕', categories: ['重要副詞'] },
  { key: 'rleg', label: '右脚', categories: ['重要名詞'] },
  { key: 'lleg', label: '左脚', categories: ['多義語', '現古異義語', '接頭辞', '重要形容動詞'] },
];

// 7段階クオリティ (Lv1 影 → Lv7 金)
const QUALITY_STAGES = [
  { name: '影', bg: 'rgba(40,40,40,0.18)', text: '#888', glow: '' },
  { name: '紙', bg: '#f6efe2', text: '#a89372', glow: '' },
  { name: '木', bg: '#a9764b', text: '#fff', glow: '' },
  { name: '銅', bg: '#c97a3a', text: '#fff', glow: '0 0 6px rgba(201,122,58,0.5)' },
  { name: '鉄', bg: '#6e7787', text: '#fff', glow: '0 0 6px rgba(110,119,135,0.5)' },
  { name: '銀', bg: '#cfd6dc', text: '#222', glow: '0 0 8px rgba(207,214,220,0.9)' },
  { name: '金', bg: '#e8c14a', text: '#3a2a00', glow: '0 0 12px rgba(232,193,74,0.9)' },
];

export default function StatsPage() {
  const [stats, setStats] = useState<Record<string, WordStat>>({});
  const [weakQids, setWeakQids] = useState<string[]>([]);
  const [dueQids, setDueQids] = useState<string[]>([]);
  const [srsRows, setSrsRows] = useState<SrsBoxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<StreakSnapshot>({ current: 0, longest: 0, lastActiveDate: null });
  const [theme, setTheme] = useState<CharacterTheme>('garden');

  useEffect(() => {
    setStreak(readStreak());
    try {
      const v = localStorage.getItem(CHARACTER_THEME_KEY);
      if (v === 'garden' || v === 'robot') setTheme(v);
      // 旧テーマ('sakura'/'ginkgo')は garden に丸める
      else if (v === 'sakura' || v === 'ginkgo') setTheme('garden');
    } catch {
      /* ignore */
    }
  }, []);

  const updateTheme = (t: CharacterTheme) => {
    setTheme(t);
    try {
      localStorage.setItem(CHARACTER_THEME_KEY, t);
    } catch {
      /* ignore */
    }
  };

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

  // 全体ハイブリッドスコア (桜・銀杏用)
  // よく練習した単語 Top 20
  const mostPracticed = useMemo(() => {
    return allGroups
      .map((g) => groupAgg[g])
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || b.correct - a.correct)
      .slice(0, 20);
  }, [groupAgg, allGroups]);

  // === 庭(Garden) + ロボット 用: localStorage を都度読み直す ===
  const [gardenSig, setGardenSig] = useState(0); // ページに戻ってきたら再読する用
  const [quizTypeStats, setQuizTypeStats] = useState<QuizTypeStats>({});
  const [publishedSet, setPublishedSet] = useState<Set<string> | null>(null);
  useEffect(() => {
    const refresh = () => {
      setGardenSig((n) => n + 1);
      setQuizTypeStats(getQuizTypeCorrect());
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => {
    getPublishedSlugs().then((s) => setPublishedSet(s));
  }, []);

  const garden = useMemo<GardenPlant[]>(() => {
    if (typeof window === 'undefined') return [];
    void gardenSig;
    const fullAccess = hasFullAccess();
    const allTexts = (bundledTextsV3 as TextV3Entry[]).filter(
      (t) => fullAccess || !publishedSet || publishedSet.has(t.id)
    );
    const allProgress = loadAllProgress();
    const counters = getOpenCounters();
    const out: GardenPlant[] = [];
    for (const t of allTexts) {
      // 進度: 完了レイヤー数 (0-5) + currentLayer (1-5) + tokensViewed 件数の対数
      const prog = allProgress[t.id];
      const completed = prog ? prog.completedLayers.length : 0; // 0..5
      const tokensViewed = prog ? prog.tokensViewed.length : 0;
      const currentLayer = prog ? prog.currentLayer : 0;

      // 開閉カウンタ
      const vmap = counters.vocab[t.id] || {};
      const hmap = counters.hint[t.id] || {};
      const vocabOpens = Object.values(vmap).reduce((s, v) => s + v, 0);
      const hintOpens = Object.values(hmap).reduce((s, v) => s + v, 0);
      const uniqueVocabOpened = Object.keys(vmap).length;
      const uniqueHintOpened = Object.keys(hmap).length;

      // シークレット成長式 — UIには出さない
      // 完了レイヤー(最大15点) + currentレイヤー(0-5) + ユニーク開閉(各最大10点) +
      // 累計開閉(対数で頭打ち)
      const score =
        completed * 3 +
        currentLayer * 0.5 +
        Math.min(10, uniqueVocabOpened) +
        Math.min(10, uniqueHintOpened) +
        Math.log2(1 + vocabOpens + hintOpens) * 1.5 +
        Math.log2(1 + tokensViewed) * 0.5;

      // しきい値 (シークレット): 0/2/5/10/18/30/45 → Lv 0..6
      let level = 0;
      if (score >= 45) level = 6;
      else if (score >= 30) level = 5;
      else if (score >= 18) level = 4;
      else if (score >= 10) level = 3;
      else if (score >= 5) level = 2;
      else if (score >= 2) level = 1;

      out.push({
        id: t.id,
        title: t.title,
        source: t.source ?? '',
        genre: t.genre ?? '',
        species: speciesForText(t.genre),
        level,
      });
    }
    return out;
  }, [gardenSig, publishedSet]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, weak, due] = await Promise.all([getWordStats(), getWeakWords(), getDueWords()]);
        // SRS box 分布も取得
        const userId = (await currentAuthUid()) ?? '';
        let srs: SrsBoxRow[] = [];
        if (userId) {
          const { data } = await supabase.from('srs_state').select('qid, box').eq('user_id', userId);
          srs = (data ?? []) as SrsBoxRow[];
        }
        if (cancelled) return;
        setStats(s);
        setWeakQids(weak);
        setDueQids(due);
        setSrsRows(srs);
      } catch (e) {
        // silent fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
            {/* サマリ 4 カード */}
            <section className="grid grid-cols-2 gap-3 mb-6">
              <SummaryCard
                label="累計正答率"
                value={`${Math.round(overall.accuracy * 100)}%`}
                bg="var(--rw-accent-soft)"
                fg="var(--rw-accent)"
              />
              <SummaryCard
                label="挑戦した単語"
                value={`${overall.uniqueWords}語`}
                bg="var(--rw-primary-soft)"
                fg="var(--rw-primary)"
              />
              <SummaryCard
                label="マスター数"
                value={`${overall.mastered}語`}
                bg="var(--rw-pop)"
                fg="var(--rw-ink)"
                hintTone={0.85}
              />
              <SummaryCard
                label="今日の復習"
                value={`${dueQids.length}語`}
                bg="color-mix(in srgb, var(--rw-tertiary) 25%, transparent)"
                fg="var(--rw-tertiary)"
              />
            </section>

            {/* 連続学習 */}
            <section className="mb-6">
              <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
                連続学習
              </h2>
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4 flex items-center gap-4">
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl shrink-0"
                  style={{ background: 'var(--rw-primary-soft)' }}
                >
                  <span className="text-2xl">🔥</span>
                  <div>
                    <div className="text-[10px] tracking-wider font-bold uppercase text-rw-ink-soft">今</div>
                    <div className="text-2xl font-black text-rw-primary leading-none">
                      {streak.current}
                      <span className="text-sm font-bold ml-1">日</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-rw-ink-soft font-bold">最長連続記録</div>
                  <div className="text-xl font-black text-rw-ink mt-0.5">
                    {streak.longest}<span className="text-xs font-bold ml-1">日</span>
                  </div>
                  {streak.lastActiveDate && (
                    <div className="text-[10px] text-rw-ink-soft mt-1">
                      最終学習: {streak.lastActiveDate}
                    </div>
                  )}
                </div>
              </div>
            </section>

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

            {/* 練習量 セクション */}
            <section className="mb-6">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase">
                  練習量
                </h2>
                <div className="flex items-center gap-1 text-[10px] font-bold">
                  <ThemeButton current={theme} value="garden" label="🌿 庭" onClick={updateTheme} />
                  <ThemeButton current={theme} value="robot" label="🤖 ロボ" onClick={updateTheme} />
                </div>
              </div>

              {/* キャラクター */}
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-3">
                {theme === 'robot' ? (
                  <RobotCharacter groupAgg={groupAgg} quizTypeStats={quizTypeStats} />
                ) : (
                  <Garden plants={garden} />
                )}
              </div>

              {/* 累計回答数 + 分布 */}
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-3">
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <div className="text-[10px] tracking-wider font-bold uppercase text-rw-ink-soft">
                      累計回答数
                    </div>
                    <div className="text-2xl font-black text-rw-ink mt-0.5">
                      {overall.answered}<span className="text-xs font-bold ml-1">回</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] tracking-wider font-bold uppercase text-rw-ink-soft">
                      着手 / 全{allGroups.length}語
                    </div>
                    <div className="text-2xl font-black text-rw-ink mt-0.5">
                      {allGroups.length - distribution['0']}<span className="text-xs font-bold ml-1">語</span>
                    </div>
                  </div>
                </div>
                <DistributionBars distribution={distribution} total={allGroups.length} />
              </div>

              {/* ヒートマップ */}
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-3">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[11px] font-bold text-rw-ink">
                    全 {allGroups.length} 語ヒートマップ
                  </div>
                  <div className="text-[9px] text-rw-ink-soft">
                    タップで復習
                  </div>
                </div>
                <Heatmap groups={allGroups.map((g) => groupAgg[g])} />
                <HeatmapLegend />
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
                    return (
                      <div
                        key={row.group}
                        className="bg-rw-paper border border-rw-rule rounded-xl px-3 py-2.5 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-rw-ink truncate text-sm flex items-center gap-1.5">
                            {row.lemma}
                            {row.mastered && (
                              <span
                                className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                                style={{ background: 'var(--rw-accent-soft)', color: 'var(--rw-accent)' }}
                              >
                                MASTER
                              </span>
                            )}
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
                        <Link
                          to={`/?qid=${encodeURIComponent(row.qids.join(','))}`}
                          className="text-[10px] font-black rounded-full px-2 py-1 shrink-0 no-underline"
                          style={{ background: 'var(--rw-ink)', color: 'var(--rw-paper)' }}
                          title={`「${row.lemma}」だけ復習`}
                        >
                          🔁
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <p className="text-[11px] text-rw-ink-soft text-center mt-6">
                履歴は同じ端末・同じブラウザで継続されます。
                <br />
                端末を変えると別ユーザー扱いになります。
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
}: {
  label: string;
  value: string;
  bg: string;
  fg: string;
  hintTone?: number;
}) {
  return (
    <div
      className="rounded-2xl p-4 border border-rw-rule"
      style={{ background: bg, opacity: hintTone ?? 1 }}
    >
      <div className="text-[10px] tracking-wider font-bold uppercase text-rw-ink-soft">
        {label}
      </div>
      <div className="text-3xl font-black mt-1" style={{ color: fg }}>
        {value}
      </div>
    </div>
  );
}

function ThemeButton({
  current,
  value,
  label,
  onClick,
}: {
  current: CharacterTheme;
  value: CharacterTheme;
  label: string;
  onClick: (t: CharacterTheme) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className="px-2.5 py-1 rounded-full transition-colors"
      style={{
        background: active ? 'var(--rw-ink)' : 'var(--rw-paper)',
        color: active ? 'var(--rw-paper)' : 'var(--rw-ink-soft)',
        border: `1px solid ${active ? 'var(--rw-ink)' : 'var(--rw-rule)'}`,
      }}
    >
      {label}
    </button>
  );
}

// ── 庭(Garden) ──
// 1作品=1株。タイル状に並べ、レベルに応じた絵文字を表示。
// シークレット成長式: UIに進度バー・スコア・しきい値を出さない。
function Garden({ plants }: { plants: GardenPlant[] }) {
  // 着手済み(Lv >= 1) と 未着手 を分ける
  const grown = plants.filter((p) => p.level > 0);
  const dormant = plants.filter((p) => p.level === 0);

  // 並び替え: レベル降順 → タイトル
  const sortedGrown = [...grown].sort(
    (a, b) => b.level - a.level || a.title.localeCompare(b.title, 'ja')
  );

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-base font-black text-rw-ink">🌿 庭</span>
        <span className="text-[10px] text-rw-ink-soft font-bold">
          {grown.length} / {plants.length} 株
        </span>
      </div>
      <div className="text-[11px] text-rw-ink-soft mb-3">
        作品を学ぶと、なぜか庭の植物が育っていく…
      </div>

      {/* 育っている株 */}
      {sortedGrown.length === 0 ? (
        <div
          className="rounded-xl p-4 text-center text-[11px] text-rw-ink-soft"
          style={{ background: 'color-mix(in srgb, var(--rw-tertiary) 8%, var(--rw-paper))' }}
        >
          まだ庭は土だけ。作品を読み始めると、芽が出るかも…
        </div>
      ) : (
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))' }}
        >
          {sortedGrown.map((p) => (
            <PlantTile key={p.id} plant={p} />
          ))}
        </div>
      )}

      {/* 未着手 (土に埋もれた種) */}
      {dormant.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] text-rw-ink-soft font-bold mb-1.5">
            ねむっている種 {dormant.length}
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(28px, 1fr))' }}
          >
            {dormant.slice(0, 60).map((p) => (
              <Link
                key={p.id}
                to={`/read/texts/${encodeURIComponent(p.id)}`}
                className="aspect-square rounded text-[10px] flex items-center justify-center no-underline opacity-50 hover:opacity-100 transition-opacity"
                style={{ background: 'color-mix(in srgb, #8b6f47 15%, transparent)', color: '#5a432a' }}
                title={`${p.title} (${p.source}) — 未着手`}
              >
                ·
              </Link>
            ))}
            {dormant.length > 60 && (
              <span className="text-[10px] text-rw-ink-soft self-center">
                +{dormant.length - 60}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlantTile({ plant }: { plant: GardenPlant }) {
  const emoji = plant.species.stages[plant.level] ?? plant.species.stages[0];
  const isMature = plant.level >= 5;
  return (
    <Link
      to={`/read/texts/${encodeURIComponent(plant.id)}`}
      className="aspect-square rounded-lg flex flex-col items-center justify-center no-underline transition-transform hover:scale-110 border border-rw-rule"
      style={{
        background:
          'color-mix(in srgb, var(--rw-accent-soft) 60%, var(--rw-paper))',
        filter: isMature ? 'drop-shadow(0 0 6px rgba(232,193,74,0.4))' : undefined,
      }}
      title={`${plant.title} (${plant.source})`}
    >
      <div className="text-xl leading-none select-none">{emoji}</div>
    </Link>
  );
}

function RobotCharacter({
  groupAgg,
  quizTypeStats,
}: {
  groupAgg: Record<number, GroupEntry>;
  quizTypeStats: QuizTypeStats;
}) {
  // 部位 → そのジャンル(カテゴリ群)の集計 + qids
  // 多義語/記述クイズの正答数も加味してスコア化 (ロボット完成のハードルを上げる)
  const partInfo = useMemo(() => {
    const out: Record<
      string,
      {
        score: number;
        level: number;
        touched: number;
        mastered: number;
        polysemyDone: number;
        writingDone: number;
        total: number;
        qids: string[];
      }
    > = {};
    for (const part of ROBOT_PARTS) {
      let total = 0;
      let touched = 0;
      let mastered = 0;
      let polysemyDone = 0;
      let writingDone = 0;
      const qids: string[] = [];
      for (const g of Object.values(groupAgg)) {
        if (!part.categories.includes(g.category)) continue;
        total += 1;
        if (g.total > 0) touched += 1;
        if (g.mastered) mastered += 1;
        // group 内のいずれかの qid で多義語 or 記述に正答していれば達成扱い
        let hasPoly = false;
        let hasWrite = false;
        for (const qid of g.qids) {
          const r = quizTypeStats[qid];
          if (r?.polysemy && r.polysemy > 0) hasPoly = true;
          if (r?.writing && r.writing > 0) hasWrite = true;
        }
        if (hasPoly) polysemyDone += 1;
        if (hasWrite) writingDone += 1;
        qids.push(...g.qids);
      }
      const touchedRate = total > 0 ? touched / total : 0;
      const masteredRate = total > 0 ? mastered / total : 0;
      const polysemyRate = total > 0 ? polysemyDone / total : 0;
      const writingRate = total > 0 ? writingDone / total : 0;
      // 重み: 着手0.15 / マスター0.30 / 多義語0.275 / 記述0.275 (合計1.0)
      // 多義語・記述ゼロだと最大 0.45 (= Lv4 銅 で頭打ち)
      const score =
        touchedRate * 0.15 +
        masteredRate * 0.30 +
        polysemyRate * 0.275 +
        writingRate * 0.275;
      out[part.key] = {
        score,
        level: stageFromRobotScore(score),
        touched,
        mastered,
        polysemyDone,
        writingDone,
        total,
        qids,
      };
    }
    return out;
  }, [groupAgg, quizTypeStats]);

  const avgLevel =
    Object.values(partInfo).reduce((sum, p) => sum + p.level, 0) / ROBOT_PARTS.length;
  const allMaxed = Object.values(partInfo).every((p) => p.level >= 6);

  const partStyle = (level: number) => {
    const q = QUALITY_STAGES[level];
    return {
      background: q.bg,
      color: q.text,
      boxShadow: q.glow ? q.glow : undefined,
    };
  };

  const get = (key: string) =>
    partInfo[key] ?? { level: 0, score: 0, touched: 0, mastered: 0, polysemyDone: 0, writingDone: 0, total: 0, qids: [] };

  // 部位パーツ用の Link ラッパー (qids が空なら span にフォールバック)
  const PartLink = ({
    part,
    className,
    style,
    titleSuffix,
    children,
  }: {
    part: { key: string; label: string; categories: string[] };
    className: string;
    style: CSSProperties;
    titleSuffix?: string;
    children?: ReactNode;
  }) => {
    const p = get(part.key);
    const q = QUALITY_STAGES[p.level];
    const title = `${part.label}: ${q.name}${titleSuffix ? ` · ${titleSuffix}` : ''} · クリックで「${part.categories.join('・')}」を出題`;
    if (p.qids.length === 0) {
      return (
        <span className={className} style={style} title={title}>
          {children}
        </span>
      );
    }
    return (
      <Link
        to={`/?category=${encodeURIComponent(part.categories.join(','))}`}
        className={className + ' no-underline cursor-pointer'}
        style={style}
        title={title}
      >
        {children}
      </Link>
    );
  };

  return (
    <div>
      <div className="flex items-start gap-4">
        {/* ロボット組立図 (各部位クリックで該当ジャンルを出題) */}
        <div
          className="shrink-0 flex flex-col items-center"
          style={{
            filter: allMaxed ? 'drop-shadow(0 0 10px rgba(232,193,74,0.6))' : undefined,
          }}
        >
          {/* 頭 */}
          <PartLink
            part={ROBOT_PARTS[0]}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black border border-black/10 transition-transform hover:scale-110"
            style={partStyle(get('head').level)}
          >
            ⚙
          </PartLink>
          {/* 胴体 + 腕 */}
          <div className="flex items-center mt-1">
            <PartLink
              part={ROBOT_PARTS[3]}
              className="w-3 h-12 rounded-l-md border border-black/10 transition-transform hover:scale-110"
              style={partStyle(get('larm').level)}
            />
            <PartLink
              part={ROBOT_PARTS[1]}
              className="w-12 h-12 rounded-md flex items-center justify-center text-base font-black border border-black/10 transition-transform hover:scale-110"
              style={partStyle(get('body').level)}
            >
              ★
            </PartLink>
            <PartLink
              part={ROBOT_PARTS[2]}
              className="w-3 h-12 rounded-r-md border border-black/10 transition-transform hover:scale-110"
              style={partStyle(get('rarm').level)}
            />
          </div>
          {/* 脚 */}
          <div className="flex gap-1 mt-1">
            <PartLink
              part={ROBOT_PARTS[5]}
              className="w-4 h-9 rounded-md border border-black/10 transition-transform hover:scale-110"
              style={partStyle(get('lleg').level)}
            />
            <PartLink
              part={ROBOT_PARTS[4]}
              className="w-4 h-9 rounded-md border border-black/10 transition-transform hover:scale-110"
              style={partStyle(get('rleg').level)}
            />
          </div>
        </div>

        {/* ステータス */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-base font-black text-rw-ink">
              {allMaxed ? '🤖 完全覚醒!' : 'ロボット建造中'}
            </span>
            <span className="text-[10px] text-rw-ink-soft font-bold">
              平均 Lv {avgLevel.toFixed(1)} / 7
            </span>
          </div>
          <div className="text-[11px] text-rw-ink-soft mb-2">
            選択式・多義語・記述ぜんぶやり込むと部品が金になる
          </div>
          <div className="text-[10px] text-rw-ink-soft">
            👆 部位をタップでそのジャンルを出題
          </div>
        </div>
      </div>

      {/* 部位リスト (タップで該当ジャンル出題) */}
      <div className="grid grid-cols-2 gap-1.5 mt-3">
        {ROBOT_PARTS.map((part) => {
          const p = get(part.key);
          const q = QUALITY_STAGES[p.level];
          const inner = (
            <>
              <div
                className="w-6 h-6 rounded shrink-0 border border-black/10"
                style={partStyle(p.level)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black text-rw-ink truncate">
                  {part.label} <span className="text-rw-ink-soft font-bold">{q.name}</span>
                </div>
                <div className="text-[9px] text-rw-ink-soft truncate">
                  {part.categories.join('・')} · 着手{p.touched}/M{p.mastered}/多{p.polysemyDone}/記{p.writingDone}/全{p.total}
                </div>
              </div>
              {p.qids.length > 0 && (
                <span
                  className="text-[10px] font-black rounded-full px-2 py-0.5 shrink-0"
                  style={{ background: 'var(--rw-ink)', color: 'var(--rw-paper)' }}
                >
                  ▶
                </span>
              )}
            </>
          );
          if (p.qids.length === 0) {
            return (
              <div
                key={part.key}
                className="border border-rw-rule rounded-lg p-2 flex items-center gap-2"
              >
                {inner}
              </div>
            );
          }
          return (
            <Link
              key={part.key}
              to={`/?category=${encodeURIComponent(part.categories.join(','))}`}
              className="border border-rw-rule rounded-lg p-2 flex items-center gap-2 no-underline hover:bg-rw-bg transition-colors cursor-pointer"
              title={`「${part.categories.join('・')}」をクイズ範囲指定に適用して出題`}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
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
