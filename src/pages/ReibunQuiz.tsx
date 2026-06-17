import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchAllReibun, fetchMeanings, JODOSHI_ORDER } from "@/lib/kobun/reibunData";
import { recordDrillAnswer } from "@/lib/kobun/dojoData";
import type { GrammarReibun, GrammarJodoshiMeaning } from "@/lib/kobun/types";

const MAX_Q = 10;

/** 本文の 【判定対象】 と 《決め手》 を色付きで描画 */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(【[^】]*】|《[^》]*》)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("【") && p.endsWith("】"))
          return (
            <span key={i} className="font-black text-rw-ink underline decoration-2 decoration-[var(--rw-primary)]">
              {p.slice(1, -1)}
            </span>
          );
        if (p.startsWith("《") && p.endsWith("》"))
          return (
            <span key={i} className="font-bold text-rw-ink-soft underline decoration-dotted">
              {p.slice(1, -1)}
            </span>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export default function ReibunQuiz() {
  const [params] = useSearchParams();
  const target = params.get("j") || "mix"; // 助動詞名 or 'mix'

  const [reibun, setReibun] = useState<GrammarReibun[]>([]);
  const [meanings, setMeanings] = useState<GrammarJodoshiMeaning[]>([]);
  const [loading, setLoading] = useState(true);

  const [queue, setQueue] = useState<GrammarReibun[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, m] = await Promise.all([fetchAllReibun(), fetchMeanings()]);
      if (!alive) return;
      setReibun(r);
      setMeanings(m);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 助動詞→意味ラベル群（選択肢生成元）
  const meaningsByJodoshi = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of meanings) (map[m.jodoshi] ||= []).push(m.meaning);
    return map;
  }, [meanings]);

  // 出題プール（is_quiz のみ・助動詞で絞る）。2回目以降のリトライにも対応
  const buildQueue = useMemo(
    () => () => {
      const pool = reibun.filter(
        (x) => x.isQuiz && (target === "mix" || x.jodoshi === target)
      );
      return shuffle(pool).slice(0, MAX_Q);
    },
    [reibun, target]
  );

  useEffect(() => {
    if (!loading) {
      setQueue(buildQueue());
      setIdx(0);
      setPicked(null);
      setScore(0);
    }
  }, [loading, buildQueue]);

  const current = queue[idx];
  const choices = useMemo(() => {
    if (!current) return [];
    return shuffle(meaningsByJodoshi[current.jodoshi] || []);
  }, [current, meaningsByJodoshi]);

  if (loading) return <Centered>読み込み中…</Centered>;

  if (queue.length === 0)
    return (
      <Centered>
        <p className="text-rw-ink font-bold mb-3">この範囲に出題できる確実な例がありません。</p>
        <Link to="/read/grammar/reibun" className="text-rw-primary font-bold">← 例文事典へ</Link>
      </Centered>
    );

  // 終了画面
  if (idx >= queue.length) {
    const pct = Math.round((score / queue.length) * 100);
    return (
      <Centered>
        <div className="text-5xl mb-3">{pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "📖"}</div>
        <h2 className="text-2xl font-black text-rw-ink mb-1">
          {score} / {queue.length} 正解
        </h2>
        <p className="text-sm text-rw-ink-soft mb-6">正答率 {pct}%</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setQueue(buildQueue());
              setIdx(0);
              setPicked(null);
              setScore(0);
            }}
            className="px-5 py-3 rounded-2xl bg-rw-ink text-rw-paper text-sm font-black"
            style={{ boxShadow: "0 3px 0 var(--rw-primary)" }}
          >
            もう一度
          </button>
          <Link
            to="/read/grammar/reibun"
            className="px-5 py-3 rounded-2xl bg-rw-paper border-2 border-rw-ink text-rw-ink text-sm font-black"
          >
            事典へ戻る
          </Link>
        </div>
      </Centered>
    );
  }

  const answered = picked !== null;
  const correctMeaning = current.meaning;

  const onPick = (c: string) => {
    if (answered) return;
    setPicked(c);
    const ok = c === correctMeaning;
    if (ok) setScore((s) => s + 1);
    void recordDrillAnswer(current.id, ok); // 進捗記録（qid=reibun.id・既存ドリルとは別空間）
  };

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-6">
        {/* ヘッダー / 進捗 */}
        <div className="flex items-center gap-4 mb-4">
          <Link to="/read/grammar/reibun" className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink">
            ← やめる
          </Link>
          <h1 className="text-lg font-black text-rw-ink">
            意味判別 {target === "mix" ? "（混合）" : `「${target}」`}
          </h1>
          <span className="ml-auto text-sm font-black text-rw-ink-soft">
            {idx + 1} / {queue.length}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-rw-rule overflow-hidden mb-6">
          <span className="block h-full bg-rw-primary" style={{ width: `${(idx / queue.length) * 100}%` }} />
        </div>

        {/* 問題 */}
        <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl px-4 py-4 mb-4">
          <p className="text-[11px] font-black text-rw-ink-soft mb-1.5">
            【　】の「{current.jodoshi}」の意味は？
          </p>
          <p className="text-[17px] text-rw-ink leading-relaxed">
            <Highlighted text={current.sentence} />
          </p>
        </div>

        {/* 選択肢 */}
        <div className="flex flex-col gap-2 mb-4">
          {choices.map((c) => {
            let cls = "bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-ink";
            if (answered) {
              if (c === correctMeaning) cls = "bg-rw-accent/15 border-rw-accent text-rw-ink";
              else if (c === picked) cls = "bg-rw-primary/10 border-rw-primary text-rw-ink-soft";
              else cls = "bg-rw-paper border-rw-rule text-rw-ink-soft opacity-60";
            }
            return (
              <button
                key={c}
                onClick={() => onPick(c)}
                disabled={answered}
                className={`text-left px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors ${cls}`}
              >
                {answered && c === correctMeaning && "◎ "}
                {answered && c === picked && c !== correctMeaning && "✕ "}
                {c}
              </button>
            );
          })}
        </div>

        {/* 解説（解答後） */}
        {answered && (
          <div className="bg-rw-paper border border-rw-rule rounded-2xl px-4 py-3 mb-4">
            <p className="text-[12px] text-rw-ink-soft mb-1.5">{current.translation}</p>
            {current.decider && (
              <p className="text-[12px] text-rw-ink leading-relaxed">
                <span className="font-black text-[11px]">🔑 決め手</span>　{current.decider}
              </p>
            )}
            {current.context && (
              <p className="text-[12px] text-rw-ink leading-relaxed mt-1.5">
                <span className="font-black text-[11px]">📖 場面</span>　{current.context}
              </p>
            )}
            <p className="text-[11px] text-rw-ink-soft mt-2">
              ─ {current.source}
              {current.period ? `／${current.period}` : ""}
            </p>
          </div>
        )}

        {/* 次へ */}
        {answered && (
          <button
            onClick={() => {
              setIdx((i) => i + 1);
              setPicked(null);
            }}
            className="w-full py-3.5 rounded-2xl bg-rw-ink text-rw-paper text-sm font-black"
            style={{ boxShadow: "0 3px 0 var(--rw-primary)" }}
          >
            {idx + 1 >= queue.length ? "結果を見る" : "次へ →"}
          </button>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-rw-bg flex flex-col items-center justify-center text-center p-6">
      {children}
    </div>
  );
}
