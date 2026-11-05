import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { GrammarDrill } from "@/lib/kobun/types";
import { fetchTodayReview, fetchDrills } from "@/lib/kobun/dojoData";
import { DrillSession, type DrillResult } from "@/components/grammar/DrillSession";

type Phase = "loading" | "ready" | "drill" | "done" | "empty" | "error";

/** 1回ぶんの復習（出す問題と、間違えたときの「一段手前」の候補） */
interface Batch {
  drills: GrammarDrill[];
  supportBank: GrammarDrill[];
}

/**
 * 文法道場・復習：単元を横断して SRS 期日到来のドリルを「今日の分」だけ出題する。
 * 解答は DrillSession 経由で recordDrillAnswer→SRS 更新まで走るため、
 * 「解いて終わり」だったドリルがここで回収され、学習サイクルが閉じる。
 *
 * 今日の分（2026-11-06）= 期日の古い順に最大20問・今日すでに解いた問題は除く（決め方は lib/kobun/dojoReview.ts）。
 * たまっている総数は出さない。終わったあと残りがあるときだけ「つづけてもう少し」で次の1回ぶんに進める。
 */
export default function GrammarDojoReview() {
  const [batch, setBatch] = useState<Batch>({ drills: [], supportBank: [] });
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<DrillResult | null>(null);
  // 終わったあとに取っておく「次の1回ぶん」（あるときだけ「つづけてもう少し」を出す）
  const [nextBatch, setNextBatch] = useState<Batch | null>(null);
  const [round, setRound] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  // この画面ですでに出した問題。記録の保存が終わる前に次の分を取っても、同じ問題を出さないため
  const shownIds = useRef<Set<string>>(new Set());

  /** 今日の分を取る（失敗したら例外。空なら drills が空） */
  const loadBatch = useCallback(async (): Promise<Batch> => {
    const { drills } = await fetchTodayReview(shownIds.current);
    // 「一段手前」の候補は無くても復習はできるので、ここの失敗は空として扱う（fetchDrills は失敗で空を返す）
    const banks = await Promise.all([...new Set(drills.map((d) => d.topicId))].map(fetchDrills));
    return { drills, supportBank: banks.flat() };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    loadBatch()
      .then((b) => {
        if (cancelled) return;
        setBatch(b);
        setPhase(b.drills.length > 0 ? "ready" : "empty");
      })
      .catch((e) => {
        console.warn("[dojo] review load failed:", e);
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loadBatch, reloadKey]);

  const startDrill = (b: Batch) => {
    for (const d of b.drills) shownIds.current.add(d.id);
    setBatch(b);
    setNextBatch(null);
    setResult(null);
    setRound((n) => n + 1);
    setPhase("drill");
  };

  const handleComplete = (r: DrillResult) => {
    setResult(r);
    setPhase("done");
    // 残りがあるかどうかは、次の1回ぶんを実際に取って確かめる（取れなければボタンを出さないだけ）
    loadBatch()
      .then((b) => setNextBatch(b.drills.length > 0 ? b : null))
      .catch(() => setNextBatch(null));
  };

  // ドリル中は iPhone 1 画面に収める専用レイアウト
  if (phase === "drill") {
    return (
      <div className="h-dvh flex flex-col bg-rw-bg">
        <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0 px-4 pt-3 pb-3">
          <div className="flex items-center gap-3 mb-2 shrink-0">
            <Link to="/read/grammar" className="text-xs font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
              ← やめる
            </Link>
            <span className="text-xs font-black text-rw-ink">🔁 復習</span>
          </div>
          <DrillSession key={round} drills={batch.drills} supportBank={batch.supportBank} onComplete={handleComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-5">
        <div className="flex items-center gap-4 mb-5">
          <Link
            to="/read/grammar"
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 文法道場
          </Link>
        </div>

        <h1 className="text-2xl font-black tracking-tight text-rw-ink mb-1">🔁 復習</h1>
        <p className="text-sm text-rw-ink-soft mb-5 leading-relaxed">
          単元をまたいで、復習どきの問題を今日の分（最大20問）だけ出題します。
        </p>

        {phase === "loading" && <p className="text-rw-ink-soft">読み込み中...</p>}

        {phase === "error" && (
          <div className="text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-8">
            <p className="text-sm font-black text-rw-ink">読み込めませんでした</p>
            <p className="text-xs text-rw-ink-soft mt-1">通信を確かめて、もう一度ためしてね。</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 px-4 py-2.5 border-2 border-rw-ink rounded-xl text-[14px] font-black text-rw-ink"
            >
              もう一度
            </button>
          </div>
        )}

        {phase === "empty" && (
          <div className="text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-8">
            <div className="text-4xl mb-2">🌱</div>
            <p className="text-sm font-black text-rw-ink">今日の分の復習はなし</p>
            <p className="text-xs text-rw-ink-soft mt-1 leading-relaxed">
              今日の分は終わったか、まだ期日が来ていません。単元でドリルを解くと、間隔をあけてここに戻ってきます。
            </p>
            <Link
              to="/read/grammar"
              className="inline-block mt-4 text-xs font-black text-rw-primary hover:underline"
            >
              単元を選ぶ →
            </Link>
          </div>
        )}

        {phase === "ready" && (
          <button
            onClick={() => startDrill(batch)}
            className="block w-full text-center bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-4 tracking-wider transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
          >
            🔁 復習を始める（{batch.drills.length}問）
          </button>
        )}

        {phase === "done" && result && (
          <div className="text-center">
            <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-8 mb-5">
              <div className="text-5xl mb-3">{result.masteryPct >= 85 ? "🎉" : "📚"}</div>
              <p className="text-3xl font-black text-rw-ink">{result.masteryPct}%</p>
              <p className="text-sm text-rw-ink-soft mt-1">
                初回回答：{result.correct} / {result.total} 正解
              </p>
              <p className="text-xs font-black mt-2 text-rw-primary">
                {result.masteryPct >= 85 ? "今回の復習はクリア！" : "間違えた問題はまた近いうちに戻ってくるよ"}
              </p>
            </div>
            {!!result.supportAnswered && <p className="text-sm text-rw-ink-soft mb-4">補助・再挑戦：{result.supportCorrect} / {result.supportAnswered} 正解（初回の得点とは別）</p>}
            {/* 残りがあるときだけ：次の1回ぶんへ（たまっている総数は出さない） */}
            {nextBatch && (
              <button
                onClick={() => startDrill(nextBatch)}
                className="block w-full text-center bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-4 mb-3 tracking-wider transition-transform hover:-translate-y-0.5"
                style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
              >
                🔁 つづけてもう少し（{nextBatch.drills.length}問）
              </button>
            )}
            <Link
              to="/read/grammar"
              className="inline-block text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors py-2"
            >
              ← 文法道場へ戻る
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
