import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GrammarTopic, LayerId, TopicProgress } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { fetchDojoTopicIds, getAllTopicProgress, fetchDueDrillCount } from "@/lib/kobun/dojoData";
import { computeDojoLevel } from "@/lib/kobun/dojoLevel";

interface Unit {
  id: string;
  title: string;
  summary: string;
  layer: LayerId;
}

const layerBgColors: Record<number, string> = {
  1: "bg-layer-1",
  2: "bg-layer-2",
  3: "bg-layer-3",
  4: "bg-layer-4",
};

function masteryLabel(p: TopicProgress | undefined): { label: string; cls: string } {
  if (!p || (p.drillTotal === 0 && !p.watched)) return { label: "未学習", cls: "text-rw-ink-soft" };
  if (p.masteryPct >= 85) return { label: "定着", cls: "text-rw-accent" };
  return { label: "学習中", cls: "text-rw-primary" };
}

/** 文法道場・ホーム：コンテンツ（ドリル）がある単元を到達度つきで一覧表示。 */
export default function GrammarDojoHome() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ids, prog, due] = await Promise.all([
        fetchDojoTopicIds(),
        getAllTopicProgress(),
        fetchDueDrillCount(),
      ]);
      const list = await Promise.all(
        ids.map(async (id) => {
          const r = await fetchJsonAsset<GrammarTopic>(`/grammar/${id}.json`);
          return r.ok
            ? { id, title: r.data.title, summary: r.data.summary, layer: r.data.layer }
            : { id, title: id, summary: "", layer: 1 as LayerId };
        })
      );
      if (cancelled) return;
      list.sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id));
      setUnits(list);
      setProgress(prog);
      setDueCount(due);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-2">
          <Link to="/read" className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← 戻る
          </Link>
          <h1 className="text-[22px] sm:text-2xl font-black text-rw-ink tracking-tight">⚔️ 文法道場</h1>
          {!loading &&
            (() => {
              const lv = computeDojoLevel(progress);
              return (
                <span className="ml-auto flex flex-col items-end gap-1">
                  <span className="text-sm font-black text-rw-primary leading-none">Lv.{lv.level}</span>
                  <span className="w-16 h-1.5 rounded-full bg-rw-rule overflow-hidden">
                    <span
                      className="block h-full bg-rw-primary"
                      style={{ width: `${Math.round((lv.xpInto / lv.xpForNext) * 100)}%` }}
                    />
                  </span>
                </span>
              );
            })()}
        </div>
        <p className="text-xs text-rw-ink-soft mb-6 leading-relaxed">
          講義動画 → 要点 → ドリルで、用言・助動詞の活用と意味を鍛える。
        </p>

        {/* 復習導線：期日が来たドリルがあるときだけ目立たせる */}
        {!loading && (
          <Link
            to="/read/grammar/review"
            className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-4 border-2 transition-colors ${
              dueCount > 0
                ? "bg-rw-primary border-rw-ink text-rw-paper hover:-translate-y-0.5"
                : "bg-rw-paper border-rw-rule text-rw-ink-soft hover:border-rw-ink-soft"
            }`}
            style={dueCount > 0 ? { boxShadow: "0 4px 0 var(--rw-ink)" } : undefined}
          >
            <span className="text-2xl flex-shrink-0">🔁</span>
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-black leading-snug ${dueCount > 0 ? "text-rw-paper" : "text-rw-ink"}`}>
                復習
              </h3>
              <p className={`text-[11px] mt-0.5 leading-relaxed ${dueCount > 0 ? "text-rw-paper/85" : "text-rw-ink-soft"}`}>
                {dueCount > 0
                  ? `単元をまたいで、いま${dueCount}問が復習どき`
                  : "いまは復習どきの問題なし"}
              </p>
            </div>
            {dueCount > 0 && (
              <span
                className="flex-shrink-0 min-w-7 h-7 px-2 rounded-full bg-rw-paper text-rw-primary text-xs font-black flex items-center justify-center"
              >
                {dueCount}
              </span>
            )}
          </Link>
        )}

        {loading ? (
          <p className="text-rw-ink-soft">読み込み中...</p>
        ) : units.length === 0 ? (
          <div className="text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-8">
            <div className="text-4xl mb-2">🛠️</div>
            <p className="text-sm font-black text-rw-ink">準備中</p>
            <p className="text-xs text-rw-ink-soft mt-1">単元のドリルがまだ登録されていません。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {units.map((u) => {
              const m = masteryLabel(progress[u.id]);
              return (
                <Link
                  key={u.id}
                  to={`/read/grammar/${u.id}`}
                  className="group flex items-start gap-3 bg-rw-paper border-2 border-rw-ink rounded-2xl px-3.5 py-3 hover:border-rw-ink-soft transition-colors"
                >
                  <span
                    className={`w-7 h-7 rounded-full text-xs font-black text-white flex items-center justify-center flex-shrink-0 ${layerBgColors[u.layer]}`}
                    style={{ boxShadow: "0 2px 0 var(--rw-ink)" }}
                  >
                    {u.layer}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-extrabold leading-snug text-rw-ink">{u.title}</h3>
                    {u.summary && (
                      <p className="text-[11px] text-rw-ink-soft mt-0.5 leading-relaxed line-clamp-2">{u.summary}</p>
                    )}
                  </div>
                  <span className={`text-[11px] font-black flex-shrink-0 ${m.cls}`}>{m.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
