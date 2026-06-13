import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GrammarDrill } from "@/lib/kobun/types";
import { fetchDueDrills } from "@/lib/kobun/dojoData";
import { DrillSession, type DrillResult } from "@/components/grammar/DrillSession";

type Phase = "loading" | "ready" | "drill" | "done" | "empty";

/**
 * 文法道場・復習：単元を横断して SRS 期日到来のドリルだけを出題する。
 * 解答は DrillSession 経由で recordDrillAnswer→SRS 更新まで走るため、
 * 「解いて終わり」だったドリルがここで回収され、学習サイクルが閉じる。
 */
export default function GrammarDojoReview() {
  const [drills, setDrills] = useState<GrammarDrill[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<DrillResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const due = await fetchDueDrills();
      if (cancelled) return;
      setDrills(due);
      setPhase(due.length > 0 ? "ready" : "empty");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleComplete = (r: DrillResult) => {
    setResult(r);
    setPhase("done");
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
          <DrillSession drills={drills} onComplete={handleComplete} />
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
          単元をまたいで、いま復習どきの問題だけを出題します。
        </p>

        {phase === "loading" && <p className="text-rw-ink-soft">読み込み中...</p>}

        {phase === "empty" && (
          <div className="text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-8">
            <div className="text-4xl mb-2">🌱</div>
            <p className="text-sm font-black text-rw-ink">いまは復習なし</p>
            <p className="text-xs text-rw-ink-soft mt-1 leading-relaxed">
              期日が来た問題はありません。単元でドリルを解くと、間隔をあけてここに戻ってきます。
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
            onClick={() => setPhase("drill")}
            className="block w-full text-center bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-4 tracking-wider transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}
          >
            🔁 復習を始める（{drills.length}問）
          </button>
        )}

        {phase === "done" && result && (
          <div className="text-center">
            <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-8 mb-5">
              <div className="text-5xl mb-3">{result.masteryPct >= 85 ? "🎉" : "📚"}</div>
              <p className="text-3xl font-black text-rw-ink">{result.masteryPct}%</p>
              <p className="text-sm text-rw-ink-soft mt-1">
                {result.correct} / {result.total} 正解
              </p>
              <p className="text-xs font-black mt-2 text-rw-primary">
                {result.masteryPct >= 85 ? "よく定着している！" : "間違えた問題はまた近いうちに戻ってくるよ"}
              </p>
            </div>
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
