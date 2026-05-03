import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWordStats, getWeakWords } from '@/lib/wordStats';
import { getDueWords } from '@/lib/srsEngine';
import { readStreak, type StreakSnapshot } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { currentAuthUid } from '@/lib/anonAuth';
import bundledKobunQ from '@/data/kobunQ.json';
import vocabIndex from '@/data/vocabIndex.json';

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

type CategoryAgg = {
  category: string;
  total: number;
  touched: number;
  mastered: number;
  score: number; // 0..1
};

type CharacterTheme = 'sakura' | 'ginkgo' | 'robot';
const CHARACTER_THEME_KEY = 'kobun-tan:dashboard-character-theme';

// 7段階(score 0..1 → stage 0..6)
function stageFromScore(score: number): number {
  if (score >= 0.85) return 6;
  if (score >= 0.70) return 5;
  if (score >= 0.50) return 4;
  if (score >= 0.30) return 3;
  if (score >= 0.15) return 2;
  if (score >= 0.05) return 1;
  return 0;
}

const SAKURA_STAGES = [
  { emoji: '🌱', name: '苗木', label: '芽吹き始め' },
  { emoji: '🌿', name: '若木', label: 'すくすく成長中' },
  { emoji: '🟢', name: '蕾', label: 'もうすぐ咲くよ' },
  { emoji: '🌸', name: 'ほころび', label: 'ちらほら咲き' },
  { emoji: '🌺', name: '五分咲', label: '見頃まであと少し' },
  { emoji: '🌸🌸', name: '満開', label: '春爛漫!' },
  { emoji: '🌸✨🌸', name: '千年桜', label: '伝説の老木' },
];

const GINKGO_STAGES = [
  { emoji: '🌰', name: '種', label: 'はじまりの一粒' },
  { emoji: '🌱', name: '芽', label: 'にょきっ' },
  { emoji: '🌿', name: '若葉', label: '青々と' },
  { emoji: '🍃', name: '緑葉', label: '木陰の風' },
  { emoji: '🍂', name: '黄葉満開', label: '秋の景色' },
  { emoji: '🟡', name: 'ぎんなん', label: '実りの秋' },
  { emoji: '🌳✨', name: '浦和の大銀杏', label: '神木の風格' },
];

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
  const [theme, setTheme] = useState<CharacterTheme>('sakura');

  useEffect(() => {
    setStreak(readStreak());
    try {
      const v = localStorage.getItem(CHARACTER_THEME_KEY);
      if (v === 'sakura' || v === 'ginkgo' || v === 'robot') setTheme(v);
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

  // カテゴリ別集計 (ロボット用)
  const categoryAggMap = useMemo(() => {
    const m: Record<string, CategoryAgg> = {};
    for (const g of allGroups) {
      const e = groupAgg[g];
      const c = e.category;
      if (!m[c]) m[c] = { category: c, total: 0, touched: 0, mastered: 0, score: 0 };
      m[c].total += 1;
      if (e.total > 0) m[c].touched += 1;
      if (e.mastered) m[c].mastered += 1;
    }
    for (const c of Object.keys(m)) {
      const a = m[c];
      const touchedRate = a.total > 0 ? a.touched / a.total : 0;
      const masteredRate = a.total > 0 ? a.mastered / a.total : 0;
      a.score = touchedRate * 0.4 + masteredRate * 0.6;
    }
    return m;
  }, [groupAgg, allGroups]);

  // 全体ハイブリッドスコア (桜・銀杏用)
  const hybridScore = useMemo(() => {
    const total = allGroups.length || 1;
    let touched = 0;
    let mastered = 0;
    for (const g of allGroups) {
      if (groupAgg[g].total > 0) touched += 1;
      if (groupAgg[g].mastered) mastered += 1;
    }
    return (touched / total) * 0.4 + (mastered / total) * 0.6;
  }, [groupAgg, allGroups]);

  // よく練習した単語 Top 20
  const mostPracticed = useMemo(() => {
    return allGroups
      .map((g) => groupAgg[g])
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || b.correct - a.correct)
      .slice(0, 20);
  }, [groupAgg, allGroups]);

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
        ) : overall.answered === 0 ? (
          <div className="bg-rw-paper border-2 border-rw-rule rounded-2xl p-8 text-center">
            <div className="text-5xl mb-3">📊</div>
            <p className="text-rw-ink-soft text-sm">
              まだ履歴がありません。
              <br />
              クイズで答えると、ここに累計が表示されます。
            </p>
          </div>
        ) : (
          <>
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
                  <ThemeButton current={theme} value="sakura" label="🌸 桜" onClick={updateTheme} />
                  <ThemeButton current={theme} value="ginkgo" label="🍂 銀杏" onClick={updateTheme} />
                  <ThemeButton current={theme} value="robot" label="🤖 ロボ" onClick={updateTheme} />
                </div>
              </div>

              {/* キャラクター */}
              <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4 mb-3">
                {theme === 'robot' ? (
                  <RobotCharacter categoryAggMap={categoryAggMap} />
                ) : (
                  <PlantCharacter
                    stages={theme === 'sakura' ? SAKURA_STAGES : GINKGO_STAGES}
                    score={hybridScore}
                  />
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

function PlantCharacter({
  stages,
  score,
}: {
  stages: typeof SAKURA_STAGES;
  score: number;
}) {
  const stage = stageFromScore(score);
  const s = stages[stage];
  const pct = Math.round(score * 100);
  const nextStageThresholds = [0.05, 0.15, 0.30, 0.50, 0.70, 0.85, 1.0];
  const nextThreshold = nextStageThresholds[stage] ?? 1;
  return (
    <div className="flex items-center gap-4">
      <div
        className="text-5xl shrink-0 select-none"
        style={{
          filter: stage >= 5 ? 'drop-shadow(0 0 8px rgba(232,193,74,0.4))' : undefined,
        }}
        aria-label={s.name}
      >
        {s.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-base font-black text-rw-ink">{s.name}</span>
          <span className="text-[10px] text-rw-ink-soft font-bold">Lv {stage + 1} / 7</span>
        </div>
        <div className="text-[11px] text-rw-ink-soft mb-2">{s.label}</div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--rw-rule)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.round((score / nextThreshold) * 100))}%`,
              background: 'var(--rw-primary)',
            }}
          />
        </div>
        <div className="text-[10px] text-rw-ink-soft mt-1">
          達成度 {pct}%{stage < 6 ? ` · 次のステージまで ${Math.max(0, Math.round((nextThreshold - score) * 100))}pt` : ' · 完成!'}
        </div>
      </div>
    </div>
  );
}

function RobotCharacter({ categoryAggMap }: { categoryAggMap: Record<string, CategoryAgg> }) {
  // 各部位のスコア(複数カテゴリ合算)
  const partLevels = useMemo(() => {
    const out: Record<string, { score: number; level: number; touched: number; mastered: number; total: number }> = {};
    for (const part of ROBOT_PARTS) {
      let total = 0;
      let touched = 0;
      let mastered = 0;
      for (const c of part.categories) {
        const a = categoryAggMap[c];
        if (!a) continue;
        total += a.total;
        touched += a.touched;
        mastered += a.mastered;
      }
      const touchedRate = total > 0 ? touched / total : 0;
      const masteredRate = total > 0 ? mastered / total : 0;
      const score = touchedRate * 0.4 + masteredRate * 0.6;
      out[part.key] = { score, level: stageFromScore(score), touched, mastered, total };
    }
    return out;
  }, [categoryAggMap]);

  const avgLevel =
    Object.values(partLevels).reduce((sum, p) => sum + p.level, 0) / ROBOT_PARTS.length;
  const allMaxed = Object.values(partLevels).every((p) => p.level >= 6);

  const partStyle = (level: number) => {
    const q = QUALITY_STAGES[level];
    return {
      background: q.bg,
      color: q.text,
      boxShadow: q.glow ? q.glow : undefined,
    };
  };

  const get = (key: string) => partLevels[key] ?? { level: 0, score: 0, touched: 0, mastered: 0, total: 0 };

  return (
    <div>
      <div className="flex items-start gap-4">
        {/* ロボット組立図 */}
        <div
          className="shrink-0 flex flex-col items-center"
          style={{
            filter: allMaxed ? 'drop-shadow(0 0 10px rgba(232,193,74,0.6))' : undefined,
          }}
        >
          {/* 頭 */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black border border-black/10"
            style={partStyle(get('head').level)}
            title={`頭部: ${QUALITY_STAGES[get('head').level].name}`}
          >
            ⚙
          </div>
          {/* 胴体 + 腕 */}
          <div className="flex items-center mt-1">
            <div
              className="w-3 h-12 rounded-l-md border border-black/10"
              style={partStyle(get('larm').level)}
              title={`左腕: ${QUALITY_STAGES[get('larm').level].name}`}
            />
            <div
              className="w-12 h-12 rounded-md flex items-center justify-center text-base font-black border border-black/10"
              style={partStyle(get('body').level)}
              title={`胴体: ${QUALITY_STAGES[get('body').level].name}`}
            >
              ★
            </div>
            <div
              className="w-3 h-12 rounded-r-md border border-black/10"
              style={partStyle(get('rarm').level)}
              title={`右腕: ${QUALITY_STAGES[get('rarm').level].name}`}
            />
          </div>
          {/* 脚 */}
          <div className="flex gap-1 mt-1">
            <div
              className="w-4 h-9 rounded-md border border-black/10"
              style={partStyle(get('lleg').level)}
              title={`左脚: ${QUALITY_STAGES[get('lleg').level].name}`}
            />
            <div
              className="w-4 h-9 rounded-md border border-black/10"
              style={partStyle(get('rleg').level)}
              title={`右脚: ${QUALITY_STAGES[get('rleg').level].name}`}
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
            ジャンルごとに部品の品質が向上していくよ
          </div>
        </div>
      </div>

      {/* 部位リスト */}
      <div className="grid grid-cols-2 gap-1.5 mt-3">
        {ROBOT_PARTS.map((part) => {
          const p = get(part.key);
          const q = QUALITY_STAGES[p.level];
          return (
            <div
              key={part.key}
              className="border border-rw-rule rounded-lg p-2 flex items-center gap-2"
            >
              <div
                className="w-6 h-6 rounded shrink-0 border border-black/10"
                style={partStyle(p.level)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black text-rw-ink truncate">
                  {part.label} <span className="text-rw-ink-soft font-bold">{q.name}</span>
                </div>
                <div className="text-[9px] text-rw-ink-soft truncate">
                  {part.categories.join('・')} · 着手{p.touched}/M{p.mastered}/全{p.total}
                </div>
              </div>
            </div>
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
