import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getVocabEntries, removeVocabEntry, type VocabEntry } from "@/lib/kobun/progress";

export default function VocabPage() {
  const [entries, setEntries] = useState<VocabEntry[]>([]);

  useEffect(() => {
    setEntries(getVocabEntries());
  }, []);

  const handleRemove = (baseForm: string, pos: string) => {
    removeVocabEntry(baseForm, pos);
    setEntries(getVocabEntries());
  };

  const grouped = entries.reduce<Record<string, VocabEntry[]>>((acc, e) => {
    (acc[e.pos] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="min-h-dvh max-w-2xl mx-auto p-6">
      <header className="mb-8">
        <Link to="/read" className="text-sm text-scaffold hover:text-sumi transition-colors">
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold mt-2">単語帳</h1>
        <p className="text-xs text-scaffold mt-1">
          {entries.length === 0
            ? "テキスト中の語をタップして「単語帳に追加」すると、ここに表示されます。"
            : `${entries.length}語を登録中`}
        </p>
      </header>

      {Object.entries(grouped).map(([pos, items]) => (
        <section key={pos} className="mb-8">
          <h2 className="text-sm font-bold text-scaffold uppercase tracking-wider mb-3">
            {pos}
          </h2>
          <div className="space-y-2">
            {items.map((entry) => (
              <div
                key={`${entry.baseForm}:${entry.pos}`}
                className="bg-white/60 backdrop-blur rounded-lg p-4 shadow-sm border border-sumi/5 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold">{entry.baseForm}</span>
                    {entry.tokenText !== entry.baseForm && (
                      <span className="text-sm text-scaffold">({entry.tokenText})</span>
                    )}
                  </div>
                  {entry.hint && (
                    <p className="text-sm text-amber-800 bg-amber-50 rounded px-2 py-1 mt-1">
                      {entry.hint}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {entry.grammarRefId && (
                      <Link
                        to={`/read/reference/${entry.grammarRefId}`}
                        className="text-xs text-layer-1 hover:underline"
                      >
                        解説 →
                      </Link>
                    )}
                    <span className="text-xs text-scaffold">
                      {entry.textId}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(entry.baseForm, entry.pos)}
                  className="text-xs text-scaffold hover:text-shu transition-colors shrink-0"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
