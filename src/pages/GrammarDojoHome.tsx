import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { GrammarTopic, LayerId, TopicProgress } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { fetchDojoTopicIds, getAllTopicProgress, fetchDueDrillCount } from "@/lib/kobun/dojoData";
import { computeDojoLevel } from "@/lib/kobun/dojoLevel";

type Category = "用言" | "助動詞" | "助詞" | "敬語" | "識別";

interface Unit {
  id: string;
  title: string;
  summary: string;
  layer: LayerId;
  category: Category;
}

/** カテゴリの表示順・見出し */
const CATEGORY_ORDER: Category[] = ["用言", "助動詞", "助詞", "敬語", "識別"];
const CATEGORY_META: Record<Category, { emoji: string; desc: string }> = {
  用言: { emoji: "✍️", desc: "動詞・形容詞・形容動詞の活用と音便" },
  助動詞: { emoji: "⚙️", desc: "意味・接続・活用、紛らわしい語の識別" },
  助詞: { emoji: "🔗", desc: "格助詞・接続助詞・係り結び" },
  敬語: { emoji: "👑", desc: "尊敬・謙譲・丁寧と敬意の方向" },
  識別: { emoji: "🔍", desc: "紛らわしい語を文脈で判別" },
};

/** カテゴリ内の教育的な並び順。未掲載の id は末尾へ（layer→id） */
const CURRICULUM = [
  "doushi-katsuyo", "doushi-yodan", "doushi-kami-ichidan", "doushi-shimo-nidan",
  "doushi-kahen", "doushi-sahen", "doushi-rahen",
  "keiyoshi-katsuyo", "keiyoshi-ku", "keiyoshi-shiku", "keiyoshi-gokan", "onbin",
  "jodoshi-toha",
  "jodoshi-jisei", "jodoshi-keri", "jodoshi-tsu", "jodoshi-nu", "jodoshi-tari", "jodoshi-ri",
  "jodoshi-mu", "jodoshi-suiryo", "jodoshi-beshi", "jodoshi-zu",
  "jodoshi-ru", "jodoshi-su", "jodoshi-ganbou", "jodoshi-dantei", "jodoshi-nari",
  "joshi-kaku", "joshi-setsuzoku", "joshi-fuku-kakari", "joshi-shujoshi", "kakari-musubi",
  "keigo", "keigo-sonkei", "keigo-kenjou", "keigo-teinei",
  "shikibetsu", "shikibetsu-ni", "shikibetsu-nu-ne", "shikibetsu-namu",
  "shikibetsu-ru-re", "shikibetsu-nari", "shikibetsu-shi", "vocab-kokon",
];
const orderIndex = (id: string) => {
  const i = CURRICULUM.indexOf(id);
  return i < 0 ? 999 : i;
};

const OPEN_KEY = "kobun-dojo-cats-v1";

function masteryLabel(p: TopicProgress | undefined): { label: string; cls: string; dot: string } {
  if (!p || (p.drillTotal === 0 && !p.watched))
    return { label: "未学習", cls: "text-rw-ink-soft", dot: "bg-rw-rule" };
  if (p.masteryPct >= 85) return { label: "定着", cls: "text-rw-accent", dot: "bg-rw-accent" };
  return { label: "学習中", cls: "text-rw-primary", dot: "bg-rw-primary" };
}

/** 文法道場・ホーム：ドリルがある単元をカテゴリ別トグルで一覧表示。 */
export default function GrammarDojoHome() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return { 用言: true }; // 初回は最初のカテゴリだけ開く
  });

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
            ? { id, title: r.data.title, summary: r.data.summary, layer: r.data.layer, category: r.data.category as Category }
            : { id, title: id, summary: "", layer: 1 as LayerId, category: "用言" as Category };
        })
      );
      if (cancelled) return;
      setUnits(list);
      setProgress(prog);
      setDueCount(due);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** カテゴリ → 単元（教育的順序） */
  const grouped = useMemo(() => {
    const g: Partial<Record<Category, Unit[]>> = {};
    for (const u of units) (g[u.category] ||= []).push(u);
    for (const k of Object.keys(g) as Category[])
      g[k]!.sort((a, b) => orderIndex(a.id) - orderIndex(b.id) || a.layer - b.layer || a.id.localeCompare(b.id));
    return g;
  }, [units]);

  const toggle = (c: Category) =>
    setOpen((prev) => {
      const next = { ...prev, [c]: !prev[c] };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

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
          用言・助動詞・助詞・敬語・識別の5分野。講義動画 → 要点 → ドリルで鍛える。
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
                {dueCount > 0 ? `単元をまたいで、いま${dueCount}問が復習どき` : "いまは復習どきの問題なし"}
              </p>
            </div>
            {dueCount > 0 && (
              <span className="flex-shrink-0 min-w-7 h-7 px-2 rounded-full bg-rw-paper text-rw-primary text-xs font-black flex items-center justify-center">
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
            {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((cat) => {
              const list = grouped[cat]!;
              const meta = CATEGORY_META[cat];
              const isOpen = !!open[cat];
              const mastered = list.filter((u) => (progress[u.id]?.masteryPct ?? 0) >= 85).length;
              const pct = Math.round((mastered / list.length) * 100);
              return (
                <div key={cat}>
                  {/* カテゴリ見出し（トグル） */}
                  <button
                    onClick={() => toggle(cat)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 bg-rw-paper border-2 border-rw-ink rounded-2xl px-4 py-3 hover:bg-rw-primary-soft/30 transition-colors"
                    style={{ boxShadow: "0 2px 0 var(--rw-ink)" }}
                  >
                    <span className="text-xl flex-shrink-0">{meta.emoji}</span>
                    <div className="flex-1 min-w-0 text-left">
                      <h2 className="text-sm font-black text-rw-ink leading-snug">
                        {cat}
                        <span className="text-[11px] font-bold text-rw-ink-soft ml-1.5">{list.length}単元</span>
                      </h2>
                      <p className="text-[10px] text-rw-ink-soft mt-0.5 leading-snug line-clamp-1">{meta.desc}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] font-black text-rw-ink-soft">定着 {mastered}/{list.length}</span>
                      <span className="w-14 h-1.5 rounded-full bg-rw-rule overflow-hidden">
                        <span className="block h-full bg-rw-accent" style={{ width: `${pct}%` }} />
                      </span>
                    </div>
                    <span className="text-rw-ink-soft text-sm font-black w-3 text-center flex-shrink-0">
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </button>

                  {/* 単元一覧 */}
                  {isOpen && (
                    <div className="flex flex-col gap-1.5 mt-1.5 mb-1 pl-2">
                      {list.map((u) => {
                        const m = masteryLabel(progress[u.id]);
                        return (
                          <Link
                            key={u.id}
                            to={`/read/grammar/${u.id}`}
                            className="group flex items-start gap-3 bg-rw-paper border-2 border-rw-rule rounded-xl px-3.5 py-2.5 hover:border-rw-ink transition-colors"
                          >
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${m.dot}`} />
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
