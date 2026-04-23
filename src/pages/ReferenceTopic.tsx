import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GrammarTopic, SectionPriority } from "@/lib/kobun/types";
import { TextExampleCard } from "@/components/kobun/TextExampleCard";

const priorityOrder: Record<SectionPriority, number> = {
  essential: 0,
  important: 1,
  supplementary: 2,
};

const priorityLabel: Record<SectionPriority, string> = {
  essential: "必須",
  important: "重要",
  supplementary: "補足",
};

const priorityStyle: Record<SectionPriority, string> = {
  essential: "bg-shu/10 text-shu border-shu/30",
  important: "bg-kin/10 text-kin border-kin/30",
  supplementary: "bg-sumi/5 text-sumi/50 border-sumi/10",
};

export default function ReferenceTopic() {
  const params = useParams();
  const topicId = params.topicId as string | undefined;
  const [topic, setTopic] = useState<GrammarTopic | null>(null);
  const [error, setError] = useState(false);
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    if (!topicId) {
      setError(true);
      return;
    }
    let cancelled = false;
    setTopic(null);
    setError(false);
    fetch(`/grammar/${topicId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) setTopic(data as GrammarTopic);
        else setError(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const toggleSection = (index: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (!topicId) {
    return <div className="p-6">トピックが見つかりません</div>;
  }

  if (error) {
    return (
      <div className="min-h-dvh max-w-2xl mx-auto p-6">
        <Link to="/read/reference" className="text-sm text-scaffold hover:text-sumi">
          ← 文法リファレンス
        </Link>
        <div className="mt-10 text-center">
          <p className="text-lg font-bold">準備中</p>
          <p className="text-sm text-scaffold mt-2">
            このトピックのデータはまだ用意されていません。
          </p>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-scaffold">読み込み中...</p>
      </div>
    );
  }

  // Sort sections by priority
  const sortedSections = topic.sections
    .map((s, i) => ({ section: s, originalIndex: i }))
    .sort((a, b) => {
      const pa = priorityOrder[a.section.priority || "supplementary"];
      const pb = priorityOrder[b.section.priority || "supplementary"];
      return pa - pb;
    });

  return (
    <div className="min-h-dvh max-w-2xl mx-auto p-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/read/reference"
          className="text-sm text-scaffold hover:text-sumi transition-colors"
        >
          ← 文法リファレンス
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">{topic.title}</h1>
      <p className="text-sm text-scaffold mb-6">{topic.summary}</p>

      {/* ポイント */}
      {topic.keyPoints && topic.keyPoints.length > 0 && (
        <div className="mb-6 p-4 bg-shu/5 border border-shu/20 rounded-lg">
          <h2 className="text-sm font-bold text-shu mb-2">ポイント</h2>
          <ul className="space-y-1.5">
            {topic.keyPoints.map((point, i) => (
              <li
                key={i}
                className="text-sm leading-relaxed pl-4 relative before:content-['◆'] before:absolute before:left-0 before:text-shu before:text-xs"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 覚える手順 */}
      {topic.studySteps && topic.studySteps.length > 0 && (
        <div className="mb-6 p-4 bg-kin/5 border border-kin/20 rounded-lg">
          <h2 className="text-sm font-bold text-kin mb-2">覚える手順</h2>
          <ol className="space-y-1.5">
            {topic.studySteps.map((step, i) => (
              <li key={i} className="text-sm leading-relaxed flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-kin text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* セクション（アコーディオン） */}
      <div className="space-y-2">
        {sortedSections.map(({ section, originalIndex }) => {
          const isOpen = openSections.has(originalIndex);
          const priority = section.priority || "supplementary";

          return (
            <div
              key={originalIndex}
              className="border border-sumi/10 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleSection(originalIndex)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sumi/[0.03] transition-colors"
              >
                <h2 className="text-sm font-bold flex-1">{section.heading}</h2>
                <span
                  className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded border ${priorityStyle[priority]}`}
                >
                  {priorityLabel[priority]}
                </span>
                <span
                  className={`text-xs text-sumi/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  ▼
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-sumi/5">
                  <div className="pt-3 prose-sm prose-table:text-sm">
                    <MarkdownContent content={section.content} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* テキスト用例 */}
      {topic.textExamples.length > 0 && (
        <div className="mt-6 border border-sumi/10 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowExamples(!showExamples)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sumi/[0.03] transition-colors"
          >
            <h2 className="text-sm font-bold flex-1">
              テキスト用例（{topic.textExamples.length}件）
            </h2>
            <span
              className={`text-xs text-sumi/40 transition-transform ${showExamples ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </button>

          {showExamples && (
            <div className="px-4 pb-4 border-t border-sumi/5 pt-3 space-y-3">
              {topic.textExamples.map((example, i) => (
                <TextExampleCard key={i} example={example} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 簡易Markdownレンダラ（表・太字・改行対応） */
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // テーブル検出
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1]?.includes("--")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<MarkdownTable key={`table-${i}`} lines={tableLines} />);
      continue;
    }

    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    // リスト
    if (line.trim().startsWith("- ")) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        listItems.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={`list-${i}`} className="list-disc pl-5 space-y-1">
          {listItems.map((item, j) => (
            <li key={j}>
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 番号付きリスト
    if (/^\d+\.\s/.test(line.trim())) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`olist-${i}`} className="list-decimal pl-5 space-y-1">
          {listItems.map((item, j) => (
            <li key={j}>
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 通常の段落
    elements.push(
      <p key={`p-${i}`}>
        <InlineMarkdown text={line} />
      </p>
    );
    i++;
  }

  return <div className="space-y-3 text-sm leading-relaxed">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-bold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const parseRow = (line: string) =>
    line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border-b-2 border-sumi/20 px-2 py-1 text-left font-bold"
              >
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-sumi/5">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1">
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
