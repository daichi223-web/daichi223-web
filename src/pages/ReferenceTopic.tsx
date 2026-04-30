import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GrammarTopic, SectionPriority } from "@/lib/kobun/types";
import { TextExampleCard } from "@/components/kobun/TextExampleCard";
import { fetchJsonAsset } from "@/lib/fetchJson";

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
  essential: "border",
  important: "border",
  supplementary: "border",
};
const priorityInline: Record<SectionPriority, { background: string; color: string; borderColor: string }> = {
  essential: {
    background: 'color-mix(in srgb, var(--rw-primary) 15%, transparent)',
    color: 'var(--rw-primary)',
    borderColor: 'color-mix(in srgb, var(--rw-primary) 35%, transparent)',
  },
  important: {
    background: 'color-mix(in srgb, var(--rw-pop) 25%, transparent)',
    color: 'var(--rw-ink)',
    borderColor: 'color-mix(in srgb, var(--rw-pop) 50%, transparent)',
  },
  supplementary: {
    background: 'var(--rw-rule)',
    color: 'var(--rw-ink-soft)',
    borderColor: 'var(--rw-rule)',
  },
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
    fetchJsonAsset<GrammarTopic>(`/grammar/${topicId}.json`).then((r) => {
      if (cancelled) return;
      if (r.ok) setTopic(r.data);
      else setError(true);
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
    return <div className="min-h-dvh bg-rw-bg p-6 text-rw-ink">トピックが見つかりません</div>;
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-rw-bg">
        <div className="max-w-2xl mx-auto p-6">
          <Link to="/read/reference" className="text-sm text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← 文法リファレンス
          </Link>
          <div className="mt-10 text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-8">
            <div className="text-5xl mb-3">📝</div>
            <p className="text-lg font-black text-rw-ink">準備中</p>
            <p className="text-sm text-rw-ink-soft mt-2">
              このトピックのデータはまだ用意されていません。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-dvh bg-rw-bg flex items-center justify-center">
        <p className="text-rw-ink-soft">読み込み中...</p>
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
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-5">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            to="/read/reference"
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 文法リファレンス
          </Link>
        </div>

        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-rw-ink mb-2">{topic.title}</h1>
        <p className="text-sm text-rw-ink-soft mb-6 leading-relaxed">{topic.summary}</p>

        {/* ポイント */}
        {topic.keyPoints && topic.keyPoints.length > 0 && (
          <div
            className="mb-5 p-4 rounded-2xl border-l-4"
            style={{
              background: 'var(--rw-primary-soft)',
              borderLeftColor: 'var(--rw-primary)',
            }}
          >
            <h2 className="text-xs font-black tracking-wider text-rw-primary mb-2 uppercase">ポイント</h2>
            <ul className="space-y-1.5">
              {topic.keyPoints.map((point, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed pl-4 relative text-rw-ink before:content-['◆'] before:absolute before:left-0 before:text-rw-primary before:text-xs"
                >
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 覚える手順 */}
        {topic.studySteps && topic.studySteps.length > 0 && (
          <div
            className="mb-5 p-4 rounded-2xl border-l-4"
            style={{
              background: 'color-mix(in srgb, var(--rw-pop) 25%, transparent)',
              borderLeftColor: 'var(--rw-pop)',
            }}
          >
            <h2 className="text-xs font-black tracking-wider text-rw-ink mb-2 uppercase">覚える手順</h2>
            <ol className="space-y-1.5">
              {topic.studySteps.map((step, i) => (
                <li key={i} className="text-sm leading-relaxed flex gap-2 text-rw-ink">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full text-white text-[11px] font-black flex items-center justify-center mt-0.5"
                    style={{ background: 'var(--rw-ink)' }}
                  >
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
                className="bg-rw-paper border-2 border-rw-rule rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => toggleSection(originalIndex)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-rw-primary-soft/40 transition-colors"
                >
                  <h2 className="text-sm font-black flex-1 text-rw-ink">{section.heading}</h2>
                  <span
                    className={`shrink-0 px-2 py-0.5 text-[10px] font-black rounded-full ${priorityStyle[priority]}`}
                    style={priorityInline[priority]}
                  >
                    {priorityLabel[priority]}
                  </span>
                  <span
                    className={`text-xs text-rw-ink-soft transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-rw-rule">
                    <div className="pt-3 prose-sm prose-table:text-sm text-rw-ink">
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
          <div className="mt-5 bg-rw-paper border-2 border-rw-rule rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-rw-primary-soft/40 transition-colors"
            >
              <h2 className="text-sm font-black flex-1 text-rw-ink">
                テキスト用例（{topic.textExamples.length}件）
              </h2>
              <span
                className={`text-xs text-rw-ink-soft transition-transform ${showExamples ? "rotate-180" : ""}`}
              >
                ▼
              </span>
            </button>

            {showExamples && (
              <div className="px-4 pb-4 border-t border-rw-rule pt-3 space-y-3">
                {topic.textExamples.map((example, i) => (
                  <TextExampleCard key={i} example={example} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
                className="border-b-2 border-rw-ink px-2 py-1 text-left font-black text-rw-ink"
                style={{ background: 'var(--rw-primary-soft)' }}
              >
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-rw-rule">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 text-rw-ink">
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
