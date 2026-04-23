import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { TextExample } from "@/lib/kobun/types";

interface TextExampleCardProps {
  example: TextExample;
}

interface TextIndexEntry {
  id: string;
  title: string;
}

/** タイトル解決用 Map（モジュールレベルでキャッシュ） */
let titleMapCache: Record<string, string> | null = null;
let titleMapPromise: Promise<Record<string, string>> | null = null;

async function loadTitleMap(): Promise<Record<string, string>> {
  if (titleMapCache) return titleMapCache;
  if (titleMapPromise) return titleMapPromise;
  titleMapPromise = fetch("/texts-v3/index.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((entries: TextIndexEntry[]) => {
      const map: Record<string, string> = {};
      for (const e of entries) {
        if (e && e.id) map[e.id] = e.title ?? e.id;
      }
      titleMapCache = map;
      return map;
    })
    .catch(() => {
      titleMapCache = {};
      return {};
    });
  return titleMapPromise;
}

export function TextExampleCard({ example }: TextExampleCardProps) {
  const [titleMap, setTitleMap] = useState<Record<string, string>>(
    titleMapCache ?? {}
  );

  useEffect(() => {
    let cancelled = false;
    loadTitleMap().then((map) => {
      if (!cancelled) setTitleMap(map);
    });
    return () => {
      cancelled = true;
    };
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
