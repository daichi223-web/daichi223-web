import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWordStats, getWeakWords } from '@/lib/wordStats';
import { getDueWords } from '@/lib/srsEngine';
import { readStreak, type StreakSnapshot } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { currentAuthUid } from '@/lib/anonAuth';
import bundledKobunQ from '@/data/kobunQ.json';

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

export default function StatsPage() {
  const [stats, setStats] = useState<Record<string, WordStat>>({});
  const [weakQids, setWeakQids] = useState<string[]>([]);
  const [dueQids, setDueQids] = useState<string[]>([]);
  const [srsRows, setSrsRows] = useState<SrsBoxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<StreakSnapshot>({ current: 0, longest: 0, lastActiveDate: null });

  useEffect(() => {
    setStreak(readStreak());
  }, []);

  const lemmaIndex = useMemo(buildLemmaIndex, []);

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
