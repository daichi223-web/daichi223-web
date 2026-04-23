import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { TextExample } from "@/lib/kobun/types";
import bundledTextsV3Index from "@/data/textsV3Index.json";

interface TextExampleCardProps {
  example: TextExample;
}

interface TextIndexEntry {
  id: string;
  title: string;
}

let titleMapCache: Record<string, string> | null = null;

function loadTitleMap(): Record<string, string> {
  if (titleMapCache) return titleMapCache;
  const map: Record<string, string> = {};
  for (const e of bundledTextsV3Index as TextIndexEntry[]) {
    if (e && e.id) map[e.id] = e.title ?? e.id;
  }
  titleMapCache = map;
  return map;
}

export function TextExampleCard({ example }: TextExampleCardProps) {
  const [titleMap, setTitleMap] = useState<Record<string, string>>(
    titleMapCache ?? {}
  );

  useEffect(() => {
    setTitleMap(loadTitleMap());
  }, []);

  const title = titleMap[example.textId] ?? example.textId;

  return (
    <Link
      to={`/texts/${example.textId}?layer=2`}
      className="block bg-white/50 rounded-lg p-3 border border-sumi/5
                 hover:bg-white/80 hover:shadow-sm transition-all"
    >
      <p className="text-sm">
        <ExcerptMarkdown text={example.excerpt} />
      </p>
      <p className="text-xs text-scaffold mt-1">
        {title} — {example.explanation}
      </p>
    </Link>
  );
}

/** excerpt 中の **bold** を表示 */
function ExcerptMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-bold text-shu">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
