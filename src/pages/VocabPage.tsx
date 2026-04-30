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
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-7">
          <Link
            to="/read"
            className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 戻る
          </Link>
          <h1 className="mt-3 text-[30px] font-black tracking-tight text-rw-ink leading-none">
            単語帳
          </h1>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2">
            {entries.length === 0
              ? "テキスト中の語をタップして「単語帳に追加」すると、ここに表示されます。"
              : `${entries.length}語を登録中`}
          </p>
        </header>

        {entries.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center px-6">
            <div className="text-6xl mb-4" aria-hidden="true">
              📚
            </div>
            <p className="text-base font-bold text-rw-ink leading-relaxed">
              まだ単語が登録されていません
            </p>
            <p className="text-sm text-rw-ink-soft mt-2 leading-relaxed">
              テキスト中の語をタップして登録しよう
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([pos, items]) => (
            <section key={pos} className="mb-7">
              <div className="mb-3">
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-extrabold tracking-wide"
                  style={{
                    background: "var(--rw-primary-soft)",
                    color: "var(--rw-primary)",
                  }}
                >
                  {pos}
                </span>
              </div>
              <div className="space-y-2.5">
                {items.map((entry) => (
                  <div
                    key={`${entry.baseForm}:${entry.pos}`}
                    className="bg-rw-paper border border-rw-rule rounded-2xl p-4 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[19px] font-bold text-rw-ink leading-tight">
                          {entry.baseForm}
                        </span>
                        {entry.tokenText !== entry.baseForm && (
                          <span className="text-sm text-rw-ink-soft font-semibold">
                            ({entry.tokenText})
                          </span>
                        )}
                      </div>
                      {entry.hint && (
                        <p
                          className="text-sm text-rw-ink rounded-lg px-2.5 py-1.5 mt-2 font-medium leading-relaxed"
                          style={{
                            background: "color-mix(in srgb, var(--rw-pop) 30%, transparent)",
                          }}
                        >
                          {entry.hint}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                        {entry.grammarRefId && (
                          <Link
                            to={`/read/reference/${entry.grammarRefId}`}
                            className="text-xs font-extrabold text-rw-primary hover:underline"
                          >
                            解説 →
                          </Link>
                        )}
                        <span className="text-[11px] font-semibold text-rw-ink-soft">
                          {entry.textId}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(entry.baseForm, entry.pos)}
                      className="text-xs font-bold text-rw-ink-soft hover:text-rw-primary transition-colors shrink-0"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
