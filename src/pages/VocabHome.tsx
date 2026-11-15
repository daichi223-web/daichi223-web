import { useMemo, useState, useEffect, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import vocabIndex from "@/data/vocabIndex.json";
import bundledKobunQ from "@/data/kobunQ.v2.slim.json";
import vocabWhy from "@/data/vocab-why.json";
import {
  distinguishRows,
  senseLabel,
  kanaRowOf,
  compareKana,
  numberBandOf,
  KANA_ROWS,
  OTHER_ROW,
  type DistinguishRow,
  type DistinguishSense,
} from "@/lib/kobun/vocabIndexList";
import { DeciderTypeTag } from "@/components/kobun/DeciderTypeTag";

// 単語一覧（/vocab。旧「単語ホーム」）＝語を引く索引。
// 2026-11-15 ユーザー指示「もっと索引的に」「練習する・見分ける・単語帳はいらない」
// 「各語のなかで、見分ける法則を分かるように」で作り直した：
//   - 上の3つの入口（練習する／見分ける／単語帳）と、練習へ範囲を渡すための番号指定を外した
//     （練習は単語のクイズから、単語帳はホームから行ける）
//   - 五十音の行（あ・か…）か、単語帳の番号の50語ごとで区切り、上の帯で飛べる
//   - 多義語は行の「見分け方」で、意味ごとの決め手（kobunQ v2 の decider.rule）をその場で開く。
//     同じものは単語カードの中にもある（pages/VocabCard.tsx）
// データは vocabIndex(単語帳の見出し)＋kobunQ v2 の実データ。語・qid・番号は不変。並びは表示上の操作のみ。

interface VIEntry { slug: string; title: string; pos: string; category: string }
const VI = vocabIndex as unknown as Record<string, VIEntry>;

interface KQ extends DistinguishSense { lemma: string; group: number; trap?: unknown }
const KQ_ALL = bundledKobunQ as unknown as KQ[];

const AXIS = (vocabWhy as { words: Record<string, { axis?: string }> }).words;

interface WordRow {
  lemma: string;
  group: number;      // 単語帳の番号
  meanings: string;   // 意味の一言（「／」で連結）
  senseCount: number;
  hasTrap: boolean;   // 古今異義
  category: string;
  rules: DistinguishRow[]; // 見分け方（多義語のみ）
  axis?: string;      // 核からの分かれ方（vocab-why にある語のみ）
}

type Order = "kana" | "number";

const LAST_KEY = "kobun-vocab-last-lemma";
const sectionId = (key: string) => `vocab-idx-${key}`;

export default function VocabHome() {
  // ---- 実データから行を構築（1回）----
  const rows = useMemo<WordRow[]>(() => {
    const byLemma = new Map<string, KQ[]>();
    for (const r of KQ_ALL) {
      const a = byLemma.get(r.lemma) ?? [];
      a.push(r);
      byLemma.set(r.lemma, a);
    }
    const out: WordRow[] = [];
    for (const [lemma, vi] of Object.entries(VI)) {
      const senses = (byLemma.get(lemma) ?? []).sort((a, b) => (a.meaning_idx ?? 0) - (b.meaning_idx ?? 0));
      // kobunQ に sense が無い見出し（単語帳だけにある語）は単語カードを出せないので一覧にも載せない
      if (senses.length === 0) continue;
      out.push({
        lemma,
        group: senses[0]?.group ?? 9999,
        meanings: senses.map(senseLabel).filter(Boolean).join("／"),
        senseCount: senses.length,
        hasTrap: senses.some((s) => s.trap),
        category: vi.category || "",
        rules: distinguishRows(senses),
        axis: AXIS[lemma]?.axis,
      });
    }
    return out;
  }, []);

  // ---- 選択状態 ----
  // ホームの「単語一覧」の検索窓から来たときは ?q= で絞り込んだ状態で開く（2026-11-15）
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [order, setOrder] = useState<Order>("kana");
  const [cat, setCat] = useState<string>("すべて");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    try { setLast(localStorage.getItem(LAST_KEY)); } catch { /* noop */ }
  }, []);

  const toggle = (lemma: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(lemma)) next.delete(lemma);
      else next.add(lemma);
      return next;
    });

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return ["すべて", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    const key = q.trim();
    return rows.filter((r) => {
      if (cat !== "すべて" && r.category !== cat) return false;
      if (key && !r.lemma.includes(key) && !r.meanings.includes(key)) return false;
      return true;
    });
  }, [rows, q, cat]);

  // ---- 索引の区切り ----
  const sections = useMemo(() => {
    const sorted = [...filtered].sort((a, b) =>
      order === "kana" ? compareKana(a.lemma, b.lemma) : a.group - b.group || compareKana(a.lemma, b.lemma),
    );
    const map = new Map<string, WordRow[]>();
    for (const r of sorted) {
      const k = order === "kana" ? kanaRowOf(r.lemma) : numberBandOf(r.group);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return map;
  }, [filtered, order]);

  // 帯に並べる見出し（語の無い行も並べて押せなくする＝索引の形を保つ）
  const tabs = useMemo(() => {
    if (order === "kana") {
      const t: string[] = [...KANA_ROWS];
      if (rows.some((r) => kanaRowOf(r.lemma) === OTHER_ROW)) t.push(OTHER_ROW);
      return t;
    }
    const set = new Set(rows.map((r) => numberBandOf(r.group)));
    return Array.from(set).sort((a, b) => (a === "追加" ? 1 : b === "追加" ? -1 : parseInt(a) - parseInt(b)));
  }, [rows, order]);

  const jump = (key: string) => {
    document.getElementById(sectionId(key))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-3">
          <Link to="/" className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← ホーム
          </Link>
          <h1 className="mt-3 text-[28px] font-black tracking-tight text-rw-ink leading-none">🗂️ 単語一覧</h1>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2">
            語を引く索引。多義語は「見分け方」で、意味ごとの決め手を見られます。
          </p>
        </header>

        {/* 検索・並び・索引の帯（上に貼りつく） */}
        <div className="sticky top-0 z-10 -mx-5 px-5 pt-2 pb-2 bg-rw-bg border-b border-rw-rule">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 語・意味で検索（例：おどろく／気づく）"
            className="w-full rounded-xl border border-rw-rule bg-rw-paper px-3.5 py-2.5 text-sm text-rw-ink outline-none focus:border-rw-ink"
          />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] font-black text-rw-ink-soft">並び</span>
            <Pill on={order === "kana"} onClick={() => setOrder("kana")}>五十音</Pill>
            <Pill on={order === "number"} onClick={() => setOrder("number")}>番号</Pill>
            <span className="ml-auto text-[11px] font-black text-rw-accent">{filtered.length}語</span>
          </div>
          <nav aria-label="索引" className="flex flex-wrap gap-1 mt-2">
            {tabs.map((t) => {
              const has = sections.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!has}
                  onClick={() => jump(t)}
                  className={`font-black rounded-md border text-center ${
                    order === "kana" ? "text-[14px] w-8 h-8" : "text-[11px] px-2 h-7"
                  } ${has ? "border-rw-ink text-rw-ink bg-rw-paper" : "border-rw-rule text-rw-rule bg-transparent"}`}
                >
                  {t}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 品詞の絞り込み・つづき */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {categories.map((c) => (
            <Pill key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Pill>
          ))}
        </div>
        {last && (
          <Link
            to={`/word/${encodeURIComponent(last)}`}
            className="inline-block mt-3 text-[12.5px] font-black text-rw-accent no-underline"
            style={{ textDecoration: "none" }}
          >
            ▶ つづきから：{last}
          </Link>
        )}

        {/* 索引 */}
        <div className="mt-3">
          {Array.from(sections.entries()).map(([key, list]) => (
            <section key={key} id={sectionId(key)} style={{ scrollMarginTop: 150 }} className="mb-4">
              <h2 className="text-[15px] font-black text-rw-ink border-b-2 border-rw-ink pb-0.5 mb-0.5">
                {key === OTHER_ROW ? "その他" : key}
                <span className="ml-2 text-[11px] font-bold text-rw-ink-soft">{list.length}語</span>
              </h2>
              <div className="divide-y divide-rw-rule">
                {list.map((r) => (
                  <IndexRow key={r.lemma} r={r} open={open.has(r.lemma)} onToggle={() => toggle(r.lemma)} />
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-rw-ink-soft py-6">該当する語がありません</p>
          )}
        </div>
      </div>
    </div>
  );
}

function IndexRow({ r, open, onToggle }: { r: WordRow; open: boolean; onToggle: () => void }) {
  return (
    <div className="py-2">
      <div className="flex items-center gap-2.5">
        <Link
          to={`/word/${encodeURIComponent(r.lemma)}`}
          className="flex items-baseline gap-2.5 flex-1 min-w-0 no-underline"
          style={{ textDecoration: "none" }}
        >
          <span className="text-[10px] font-black text-rw-ink-soft w-7 text-right shrink-0">
            {r.group < 9999 ? r.group : "追"}
          </span>
          <span className="min-w-0">
            <span className="text-[16px] font-black text-rw-ink">{r.lemma}</span>
            <span className="block text-[12px] text-rw-ink-soft font-semibold">{r.meanings}</span>
          </span>
        </Link>
        <span className="flex gap-1 shrink-0">
          {r.hasTrap && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "var(--rw-primary-soft)", color: "var(--rw-primary)" }}>罠</span>
          )}
        </span>
        {r.rules.length > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="shrink-0 text-[11px] font-black px-2 py-1 rounded-full border"
            style={
              open
                ? { background: "var(--rw-accent)", color: "var(--rw-paper)", borderColor: "var(--rw-accent)" }
                : { background: "var(--rw-accent-soft)", color: "var(--rw-accent)", borderColor: "var(--rw-accent-soft)" }
            }
          >
            見分け方 {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="text-rw-ink-soft text-sm shrink-0">▶</span>
        )}
      </div>
      {open && r.rules.length > 0 && <DistinguishList rows={r.rules} axis={r.axis} />}
    </div>
  );
}

/** 見分け方（意味ごとの決め手）。一覧の行の下に開く */
function DistinguishList({ rows, axis }: { rows: DistinguishRow[]; axis?: string }) {
  return (
    <div className="mt-2 ml-9 rounded-xl border border-rw-rule bg-rw-paper px-3 py-2">
      {axis && <p className="text-[12px] font-bold text-rw-ink mb-1.5">🧭 {axis}</p>}
      <ul className="space-y-1.5">
        {rows.map((d) => (
          <li key={d.qid} className="text-[12.5px] leading-snug">
            <span className="font-black text-rw-accent">〈{d.label}〉</span>
            <DeciderTypeTag type={d.type} />
            <span className="text-rw-ink font-semibold">{d.rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-black px-2.5 py-1 rounded-full border"
      style={
        on
          ? { background: "var(--rw-ink)", color: "var(--rw-paper)", borderColor: "var(--rw-ink)" }
          : { background: "var(--rw-bg)", color: "var(--rw-ink-soft)", borderColor: "var(--rw-rule)" }
      }
    >
      {children}
    </button>
  );
}
