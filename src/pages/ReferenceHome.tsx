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
    <div className="min-h-dvh max-w-2xl mx-auto p-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" className="text-sm text-scaffold hover:text-sumi transition-colors">
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold">文法リファレンス</h1>
      </div>

      {/* カテゴリタブ */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {categories.map((c) => (
          <Link
            key={c.key}
            to={c.key ? `/reference?cat=${c.key}` : "/reference"}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              cat === c.key
                ? "bg-sumi text-white"
                : "bg-sumi/5 text-sumi/60 hover:bg-sumi/10"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {/* トピック一覧 */}
      <div className="space-y-3">
        {topics.map((topic) => (
          <Link
            key={topic.id}
            to={`/reference/${topic.id}`}
            className="block bg-white/60 rounded-xl p-4 shadow-sm border border-sumi/5
                       hover:bg-white/80 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <span
                className={`w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  layerBgColors[topic.layer]
                }`}
              >
                {topic.layer}
              </span>
              <div>
                <h3 className="font-bold">{topic.title}</h3>
                <p className="text-sm text-scaffold mt-0.5">{topic.summary}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
