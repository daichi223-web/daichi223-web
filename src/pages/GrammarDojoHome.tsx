import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { GrammarTopic, LayerId, TopicProgress } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { fetchDojoTopicLevels, getAllTopicProgressOrThrow, fetchTodayReviewCount } from "@/lib/kobun/dojoData";
import { computeDojoLevel } from "@/lib/kobun/dojoLevel";
import { orderIndex } from "@/lib/kobun/curriculum";
import { topicStatus, hasAnyAttempt, type TopicState } from "@/lib/kobun/topicStatus";
import { readDojoLastTopic, readDojoStartPoint } from "@/lib/kobun/dojoLocal";

type Category = "用言" | "助動詞" | "助詞" | "敬語" | "識別";

interface Unit {
  id: string;
  title: string;
  summary: string;
  layer: LayerId;
  category: string;
}

/**
 * カテゴリの表示順・見出し。
 * 「単語」の単元（vocab-*）はここに出さない（2026-11-06）。単語道場 /tango-dojo と同じ中身のため、入口はそちらに一本化した。
 */
const CATEGORY_ORDER: Category[] = ["用言", "助動詞", "助詞", "敬語", "識別"];
const CATEGORY_META: Record<Category, { emoji: string; desc: string }> = {
  用言: { emoji: "✍️", desc: "動詞・形容詞・形容動詞の活用と音便" },
  助動詞: { emoji: "⚙️", desc: "意味・接続・活用、紛らわしい語の識別" },
  助詞: { emoji: "🔗", desc: "格助詞・接続助詞・係り結び" },
  敬語: { emoji: "👑", desc: "尊敬・謙譲・丁寧と敬意の方向" },
  識別: { emoji: "🔍", desc: "紛らわしい語を文脈で判別" },
};


const OPEN_KEY = "kobun-dojo-cats-v1";

/** 札の色（言葉と状態の決め方は lib/kobun/topicStatus.ts。単語道場と共通） */
const STATE_STYLE: Record<TopicState, { cls: string; dot: string }> = {
  new: { cls: "text-rw-ink-soft", dot: "bg-rw-rule" },
  learning: { cls: "text-rw-primary", dot: "bg-rw-primary" },
  clear: { cls: "text-rw-accent", dot: "bg-rw-accent" },
};

/**
 * 先頭に並べるカード（つづきから・復習・どこから始める？）と、いちばん下の例文事典のカード。
 * 見た目は2通りだけ：strong＝いまやることとして目立たせる（復習どきがあるときの復習カードの見た目）、
 * それ以外＝控えめ（例文事典カードの見た目）。
 */
function HomeCard({
  to,
  emoji,
  title,
  desc,
  strong = false,
  badge,
  arrow = true,
}: {
  to: string;
  emoji: string;
  title: string;
  desc: string;
  strong?: boolean;
  badge?: number;
  /** 右端の「→」（復習カードは今までどおり出さない） */
  arrow?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-4 border-2 transition-colors ${
        strong
          ? "bg-rw-primary border-rw-ink text-rw-paper hover:-translate-y-0.5"
          : "bg-rw-paper border-rw-rule text-rw-ink-soft hover:border-rw-ink-soft"
      }`}
      style={strong ? { boxShadow: "0 4px 0 var(--rw-ink)" } : undefined}
    >
      <span className="text-2xl flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <h3 className={`text-sm font-black leading-snug ${strong ? "text-rw-paper" : "text-rw-ink"}`}>{title}</h3>
        <p className={`text-[11px] mt-0.5 leading-relaxed ${strong ? "text-rw-paper/85" : "text-rw-ink-soft"}`}>{desc}</p>
      </div>
      {badge !== undefined ? (
        <span className="flex-shrink-0 min-w-7 h-7 px-2 rounded-full bg-rw-paper text-rw-primary text-xs font-black flex items-center justify-center">
          {badge}
        </span>
      ) : arrow ? (
        <span className={`text-sm flex-shrink-0 ${strong ? "text-rw-paper" : "text-rw-ink-soft"}`}>→</span>
      ) : null}
    </Link>
  );
}

/** 文法道場・ホーム：ドリルがある単元をカテゴリ別トグルで一覧表示。 */
export default function GrammarDojoHome() {
  const [units, setUnits] = useState<Unit[]>([]);
  // 単元ID → その単元にあるレベル（単元の状態の判定に使う）
  const [levels, setLevels] = useState<Record<string, number[]>>({});
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});
  // 復習の「今日の分」の数（たまっている総数ではない）
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // 通信の失敗は「準備中」「復習なし」と出さず、読み込めなかったと伝える
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return { 用言: true }; // 初回は最初のカテゴリだけ開く
  });

  // 道しるべ（端末に覚えたもの）: 最後にドリルを始めた単元／学び始めの判定が決めた出発点
  const lastTopic = useMemo(() => readDojoLastTopic(), []);
  const startPoint = useMemo(() => readDojoStartPoint(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const [lv, prog, due] = await Promise.all([
          fetchDojoTopicLevels(),
          getAllTopicProgressOrThrow(),
          fetchTodayReviewCount(),
        ]);
        const ids = Object.keys(lv);
        const fetched = await Promise.all(
          ids.map(async (id): Promise<Unit | null> => {
            const r = await fetchJsonAsset<GrammarTopic>(`/grammar/${id}.json`);
            // 題名を取れなかった単元は一覧に出さない（英字の ID のまま並べない）
            return r.ok
              ? { id, title: r.data.title, summary: r.data.summary, layer: r.data.layer, category: r.data.category }
              : null;
          })
        );
        if (cancelled) return;
        const list = fetched.filter((u): u is Unit => u !== null);
        // 単元はあるのに題名が1つも取れない＝通信の失敗（「準備中」ではない）
        if (ids.length > 0 && list.length === 0) throw new Error("grammar topics: no title loaded");
        setUnits(list);
        setLevels(lv);
        setProgress(prog);
        setDueCount(due);
        setLoading(false);
      } catch (e) {
        console.warn("[dojo] home load failed:", e);
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  /** カテゴリ → 単元（教育的順序） */
  const grouped = useMemo(() => {
    const g: Record<string, Unit[]> = {};
    for (const u of units) (g[u.category] ||= []).push(u);
    for (const k of Object.keys(g))
      g[k].sort((a, b) => orderIndex(a.id) - orderIndex(b.id) || a.layer - b.layer || a.id.localeCompare(b.id));
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

  const statusOf = (id: string) => topicStatus(id, levels[id] ?? [], progress);
  const unitOf = (id: string | undefined) => (id ? units.find((u) => u.id === id) : undefined);

  // つづきから：最後にドリルを始めた単元（一覧に無い単元なら出さない）
  const lastUnit = unitOf(lastTopic?.topicId);
  // ここから：学び始めの判定が決めた出発点。その単元をクリアしたら役目は終わりなので「どこから始める？」に戻す
  const startUnit = (() => {
    const u = unitOf(startPoint?.topicId);
    return u && statusOf(u.id).state !== "clear" ? u : undefined;
  })();
  // まだどの単元も解き終えていない人には、出発点を決める入口を目立たせる
  const beginner = !hasAnyAttempt(progress);
  const ready = !loading && !loadError;

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-2">
          <Link to="/" className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← ホーム
          </Link>
          <h1 className="text-[22px] sm:text-2xl font-black text-rw-ink tracking-tight">⚔️ 文法道場</h1>
          {ready &&
            (() => {
              const lv = computeDojoLevel(progress);
              return (
                <span className="ml-auto flex flex-col items-end gap-1">
                  {/* 単元ページの難しさの Lv と区別するため「道場 Lv」と書く */}
                  <span className="text-sm font-black text-rw-primary leading-none whitespace-nowrap">道場 Lv.{lv.level}</span>
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

        {/* つづきから：前にドリルを始めた単元へ */}
        {ready && lastUnit && (
          <HomeCard
            to={`/read/grammar/${lastUnit.id}`}
            emoji="▶️"
            title={`つづきから：${lastUnit.title}${
              (levels[lastUnit.id]?.length ?? 0) > 1 && lastTopic ? `（Lv${lastTopic.level}）` : ""
            }`}
            desc="前に解いていた単元のつづきへ"
          />
        )}

        {/* 復習：今日の分があるときだけ目立たせる */}
        {ready && (
          <HomeCard
            to="/read/grammar/review"
            emoji="🔁"
            title="復習"
            desc={dueCount > 0 ? `単元をまたいで、今日の分は${dueCount}問` : "今日の分の復習はなし"}
            strong={dueCount > 0}
            badge={dueCount > 0 ? dueCount : undefined}
            arrow={false}
          />
        )}

        {/* 学び始め：出発点が決まっていれば「ここから」、まだなら判定への入口 */}
        {ready &&
          (startUnit ? (
            <HomeCard
              to={`/read/grammar/${startUnit.id}`}
              emoji="🧭"
              title={`ここから：${startUnit.title}`}
              desc="「学び始め」の判定で決まった出発点の単元"
              strong={beginner}
            />
          ) : (
            <HomeCard
              to="/manabinaoshi"
              emoji="🧭"
              title="どこから始める？"
              desc="短い確認をして、自分に合う出発点の単元を決める"
              strong={beginner}
            />
          ))}

        {loading ? (
          <p className="text-rw-ink-soft">読み込み中...</p>
        ) : loadError ? (
          <div className="text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-8">
            <p className="text-sm font-black text-rw-ink">読み込めませんでした</p>
            <p className="text-xs text-rw-ink-soft mt-1">通信を確かめて、もう一度ためしてね。</p>
            <button
              onClick={retry}
              className="mt-4 px-4 py-2.5 border-2 border-rw-ink rounded-xl text-[14px] font-black text-rw-ink"
            >
              もう一度
            </button>
          </div>
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
              const cleared = list.filter((u) => statusOf(u.id).state === "clear").length;
              const pct = Math.round((cleared / list.length) * 100);
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
                      <span className="text-[10px] font-black text-rw-ink-soft">クリア {cleared}/{list.length}</span>
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
                        const st = statusOf(u.id);
                        const style = STATE_STYLE[st.state];
                        return (
                          <Link
                            key={u.id}
                            to={`/read/grammar/${u.id}`}
                            className="group flex items-start gap-3 bg-rw-paper border-2 border-rw-rule rounded-xl px-3.5 py-2.5 hover:border-rw-ink transition-colors"
                          >
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${style.dot}`} />
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-extrabold leading-snug text-rw-ink">
                                {u.title}
                                {/* 学び始めの判定で決まった出発点の印 */}
                                {startUnit?.id === u.id && (
                                  <span className="text-[11px] font-bold text-rw-primary ml-1.5 whitespace-nowrap">🧭 ここから</span>
                                )}
                              </h3>
                              {u.summary && (
                                <p className="text-[11px] text-rw-ink-soft mt-0.5 leading-relaxed line-clamp-2">{u.summary}</p>
                              )}
                            </div>
                            <span className={`text-[11px] font-black flex-shrink-0 ${style.cls}`}>{st.label}</span>
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

        {/* 例文事典への導線（単元の一覧の下。使う人が少ないので、先頭は「次にやること」に空けた） */}
        {ready && (
          <div className="mt-4">
            <HomeCard
              to="/read/grammar/reibun"
              emoji="📖"
              title="助動詞 例文事典"
              desc="意味ごとの「決め手」と出典つき本文用例（けり・つ・ぬ・たり・り・まじ・けむ・らむ・ごとし）"
            />
          </div>
        )}
      </div>
    </div>
  );
}
