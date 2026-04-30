import { Link, useSearchParams } from "react-router-dom";
import { grammarTopics, getTopicsByCategory } from "@/lib/kobun/grammarIndex";

const categories = [
  { key: "", label: "すべて" },
  { key: "yougen", label: "用言" },
  { key: "jodoshi", label: "助動詞" },
  { key: "joshi", label: "助詞" },
  { key: "keigo", label: "敬語" },
];

const layerBgColors: Record<number, string> = {
  1: "bg-layer-1",
  2: "bg-layer-2",
  3: "bg-layer-3",
  4: "bg-layer-4",
};

export default function ReferenceHome() {
  const [searchParams] = useSearchParams();
  const cat = searchParams.get("cat") || "";
  const topics = cat ? getTopicsByCategory(cat) : grammarTopics;

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            to="/read"
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 戻る
          </Link>
          <h1 className="text-[22px] sm:text-2xl font-black text-rw-ink tracking-tight">
            文法リファレンス
          </h1>
        </div>

        {/* カテゴリタブ */}
        <div className="flex gap-1.5 mb-6 flex-wrap">
          {categories.map((c) => {
            const active = cat === c.key;
            return (
              <Link
                key={c.key}
                to={c.key ? `/read/reference?cat=${c.key}` : "/read/reference"}
                className={`px-3.5 py-2 rounded-full text-xs font-extrabold transition-colors ${
                  active
                    ? "bg-rw-ink text-rw-paper"
                    : "bg-rw-paper text-rw-ink-soft border border-rw-rule hover:text-rw-ink"
                }`}
                style={
                  active
                    ? { boxShadow: "0 2px 0 var(--rw-primary)" }
                    : undefined
                }
              >
                {c.label}
              </Link>
            );
          })}
        </div>

        {/* トピック一覧 */}
        <div className="flex flex-col gap-2">
          {topics.map((topic) => (
            <Link
              key={topic.id}
              to={`/read/reference/${topic.id}`}
              className="group flex items-start gap-3 bg-rw-paper border-2 border-rw-ink rounded-2xl px-3.5 py-3 hover:border-rw-ink-soft transition-colors"
            >
              <span
                className={`w-7 h-7 rounded-full text-xs font-black text-white flex items-center justify-center flex-shrink-0 ${
                  layerBgColors[topic.layer]
                }`}
                style={{ boxShadow: "0 2px 0 var(--rw-ink)" }}
              >
                {topic.layer}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-extrabold leading-snug text-rw-ink">
                  {topic.title}
                </h3>
                <p className="text-[11px] text-rw-ink-soft mt-0.5 leading-relaxed">
                  {topic.summary}
                </p>
              </div>
              <div className="text-sm text-rw-ink-soft flex-shrink-0">→</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
