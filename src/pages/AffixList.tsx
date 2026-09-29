import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAffixes, type AffixEntry } from "@/lib/kobun/affixes";

/**
 * 接頭語・接尾語・動詞の下に付く語の一覧（/read/affixes）。
 * 教材のポップオーバーから /read/affixes#<entry.key> で飛んでくる。
 */
export default function AffixList() {
  const doc = useAffixes();
  const { hash } = useLocation();
  const target = decodeURIComponent(hash.replace(/^#/, ""));
  const [highlight, setHighlight] = useState<string | null>(null);

  // データが描画されてから、指定の語までスクロールして一時的に強調する
  useEffect(() => {
    if (!doc || !target) return;
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(target);
    const timer = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [doc, target]);

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-5">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-4">
          <Link
            to="/read/reference"
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 文法リファレンス
          </Link>
        </div>
        <h1 className="text-[22px] sm:text-2xl font-black text-rw-ink tracking-tight mb-1">
          接頭語・接尾語 一覧
        </h1>

        {doc === undefined && <p className="text-rw-ink-soft mt-8 text-center">読み込み中...</p>}

        {doc === null && (
          <div className="mt-8 text-center bg-rw-paper border-2 border-rw-rule rounded-2xl p-8">
            <p className="text-lg font-black text-rw-ink">読み込めませんでした</p>
            <p className="text-sm text-rw-ink-soft mt-2">通信状況を確かめて、もう一度開いてください。</p>
          </div>
        )}

        {doc && (
          <>
            <p className="text-xs text-rw-ink-soft mb-4">{doc.note}</p>

            {/* 節へのジャンプ */}
            <div className="flex gap-1.5 mb-6 flex-wrap">
              {doc.sections.map((s) => (
                <a
                  key={s.id}
                  href={`#sec-${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="px-3.5 py-2 rounded-full text-xs font-extrabold bg-rw-paper text-rw-ink-soft border border-rw-rule hover:text-rw-ink"
                >
                  {s.title}
                </a>
              ))}
            </div>

            {doc.sections.map((s, i) => (
              <section key={s.id} id={`sec-${s.id}`} className="mb-8 scroll-mt-4">
                <h2 className="flex items-baseline gap-2 border-b-2 border-rw-ink pb-1 mb-2">
                  <span className="text-xs font-black bg-rw-ink text-rw-paper px-1.5 rounded">{i + 1}</span>
                  <span className="text-lg font-black text-rw-ink">{s.title}</span>
                  <span className="text-xs text-rw-ink-soft">（{s.subtitle}）</span>
                </h2>
                <p className="text-xs text-rw-ink-soft leading-relaxed mb-3">{s.lead}</p>
                <div className="flex flex-col gap-2">
                  {s.entries.map((e) => (
                    <EntryCard key={e.key} entry={e} active={highlight === e.key} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function EntryCard({ entry, active }: { entry: AffixEntry; active: boolean }) {
  const numbered = entry.means.length > 1;
  return (
    <div
      id={entry.key}
      className={`scroll-mt-24 bg-rw-paper border-2 rounded-2xl px-3.5 py-3 transition-colors duration-700 ${
        active ? "border-rw-primary bg-rw-primary-soft" : "border-rw-ink"
      }`}
    >
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-base font-black text-rw-ink">{entry.word}</span>
        <span className="text-xs text-rw-ink-soft" aria-label={`重要度${entry.stars}`}>
          {"★".repeat(entry.stars)}
        </span>
      </div>
      <ul className="space-y-1">
        {entry.means.map((m, i) => (
          <li key={i} className="text-sm text-rw-ink leading-snug">
            {numbered && <span className="font-black mr-1">{"❶❷❸❹"[i]}</span>}
            <span className="font-bold">{m.meaning}</span>
            <span className="text-rw-ink-soft"> ― {m.example}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-rw-ink-soft mt-1.5 leading-relaxed">▶ {entry.point}</p>
    </div>
  );
}
