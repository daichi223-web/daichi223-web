import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import vocabIndex from "@/data/vocabIndex.json";
import bundledKobunQ from "@/data/kobunQ.v2.slim.json";

// 統合「単語ホーム」。単語系の入口を1つに畳む:
//   🧭 理解する（カード）… この画面の主役。番号範囲・検索・つづきで語を選ぶ
//   ✍️ 練習する（クイズ・SRS）／🎯 見分ける（クラスター）／📚 単語帳 … 既存面へのリンク
// データは vocabIndex(単語帳366見出し)＋kobunQ v2(番号・意味・多義/罠) の実データ。
// 語・qid・掲載順(group番号)は不変。並び・絞り込みは表示上の操作のみ。

interface VIEntry { slug: string; title: string; pos: string; category: string }
const VI = vocabIndex as unknown as Record<string, VIEntry>;

interface KQ { lemma: string; group: number; senseNorm?: string; sense: string; trap?: unknown }
const KQ_ALL = bundledKobunQ as unknown as KQ[];

interface WordRow {
  lemma: string;
  group: number;      // 単語帳の番号
  meanings: string;   // 意味の一言（senseNorm を連結）
  senseCount: number; // 多義判定
  hasTrap: boolean;   // 古今異義
  category: string;
}

const LAST_KEY = "kobun-vocab-last-lemma";

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
      const senses = byLemma.get(lemma) ?? [];
      // kobunQ に sense が無い見出し（単語帳だけにある語）は理解カードを出せないので一覧にも載せない
      if (senses.length === 0) continue;
      const group = senses[0]?.group ?? 9999;
      const meanings = senses
        .map((s) => (s.senseNorm || s.sense || "").replace(/〔\s*|\s*〕/g, ""))
        .filter(Boolean)
        .join("／");
      out.push({
        lemma,
        group,
        meanings,
        senseCount: senses.length,
        hasTrap: senses.some((s) => s.trap),
        category: vi.category || "",
      });
    }
    out.sort((a, b) => a.group - b.group);
    return out;
  }, []);

  const maxNo = useMemo(() => rows.reduce((m, r) => (r.group < 9999 ? Math.max(m, r.group) : m), 1), [rows]);

  // ---- 選択状態 ----
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(330);
  const [cat, setCat] = useState<string>("すべて");
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    try { setLast(localStorage.getItem(LAST_KEY)); } catch { /* noop */ }
  }, []);

  // 「理解 → 練習 → 見分け を同じ範囲で」。クイズ本体(App = "/")は範囲・カテゴリを
  // localStorage から読むので、ここで選んだ範囲をそのまま書き込んでから移る。
  // キーと形式は App の useLocalStorageState と一致させること。
  const navigate = useNavigate();
  const startPractice = () => {
    try {
      localStorage.setItem("kobun-currentMode", JSON.stringify("word"));
      localStorage.setItem("kobun-wordRange", JSON.stringify({ from, to }));
      localStorage.setItem("kobun-categoryFilter", JSON.stringify(cat === "すべて" ? [] : [cat]));
    } catch { /* noop */ }
    navigate("/");
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return ["すべて", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    const key = q.trim();
    return rows.filter((r) => {
      if (r.group < from || r.group > to) return false;
      if (cat !== "すべて" && r.category !== cat) return false;
      if (key && !r.lemma.includes(key) && !r.meanings.includes(key)) return false;
      return true;
    });
  }, [rows, q, from, to, cat]);

  const clampFrom = (v: number) => setFrom(Math.max(1, Math.min(v, to)));
  const clampTo = (v: number) => setTo(Math.min(maxNo, Math.max(v, from)));

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-4">
          <Link to="/" className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← ホーム
          </Link>
          <h1 className="mt-3 text-[28px] font-black tracking-tight text-rw-ink leading-none">🗂️ 単語</h1>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2">
            覚える前に「その意味になる理由」を理解する。理解 → 練習 → 見分け を同じ範囲で。
          </p>
        </header>

        {/* 3導線（理解はこの下、ここは他の2＋単語帳） */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <DoorButton emoji="✍️" label="練習する" sub={`${from}–${to} で出題`} onClick={startPractice} />
          <DoorLink to="/tango-dojo" emoji="🎯" label="見分ける" sub="クラスター" />
          <DoorLink to="/read/vocab" emoji="📚" label="単語帳" sub="本文から" />
        </div>

        {/* 🧭 理解する（主役） */}
        <section className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-4">
          <h2 className="text-sm font-black text-rw-ink mb-2.5">🧭 単語を理解する</h2>

          {/* 検索 */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 語・意味で検索（例：おどろく／気づく）"
            className="w-full rounded-xl border border-rw-rule bg-rw-bg px-3.5 py-2.5 text-sm text-rw-ink mb-3 outline-none focus:border-rw-ink"
          />

          {/* つづき */}
          {last && (
            <Link
              to={`/word/${encodeURIComponent(last)}`}
              className="block rounded-xl px-3.5 py-2.5 mb-3 no-underline"
              style={{ background: "var(--rw-accent)", color: "var(--rw-paper)", textDecoration: "none" }}
            >
              <span className="text-[11px] font-bold opacity-90">つづきから</span>
              <span className="block text-[15px] font-black">▶ {last}</span>
            </Link>
          )}

          {/* 番号範囲（自分で指定） */}
          <div className="rounded-xl border border-rw-rule p-3 mb-3">
            <div className="text-[11px] font-black text-rw-ink-soft mb-2">📖 範囲を決めて読む（テスト範囲は自分で指定）</div>
            <div className="flex items-center gap-2 text-sm">
              <NumberStepper value={from} onChange={clampFrom} />
              <span className="font-black text-rw-ink-soft">〜</span>
              <NumberStepper value={to} onChange={clampTo} />
              <span className="ml-auto text-[11px] font-black text-rw-accent">{filtered.length}語</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <QuickRange label="1–330 基本" on={() => { setFrom(1); setTo(330); }} />
              <QuickRange label={`331–${maxNo} 追加`} on={() => { setFrom(331); setTo(maxNo); }} />
              <QuickRange label="全部" on={() => { setFrom(1); setTo(maxNo); }} />
            </div>
          </div>

          {/* 絞り込み（category） */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className="text-[11px] font-black px-2.5 py-1 rounded-full border"
                style={
                  cat === c
                    ? { background: "var(--rw-ink)", color: "var(--rw-paper)", borderColor: "var(--rw-ink)" }
                    : { background: "var(--rw-bg)", color: "var(--rw-ink-soft)", borderColor: "var(--rw-rule)" }
                }
              >
                {c}
              </button>
            ))}
          </div>

          {/* 一覧 */}
          <div className="divide-y divide-rw-rule">
            {filtered.slice(0, 400).map((r) => (
              <Link
                key={r.lemma}
                to={`/word/${encodeURIComponent(r.lemma)}`}
                className="flex items-center gap-3 py-2.5 no-underline"
                style={{ textDecoration: "none" }}
              >
                <span className="text-[10px] font-black text-rw-ink-soft w-8 text-right shrink-0">
                  {r.group < 9999 ? r.group : "追"}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[16px] font-black text-rw-ink">{r.lemma}</span>
                  <span className="block text-[12px] text-rw-ink-soft font-semibold truncate">{r.meanings}</span>
                </span>
                <span className="flex gap-1 shrink-0">
                  {r.senseCount > 1 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "var(--rw-accent-soft)", color: "var(--rw-accent)" }}>多義</span>
                  )}
                  {r.hasTrap && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "var(--rw-primary-soft)", color: "var(--rw-primary)" }}>罠</span>
                  )}
                </span>
                <span className="text-rw-ink-soft text-sm shrink-0">▶</span>
              </Link>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-rw-ink-soft py-6">該当する語がありません</p>
            )}
          </div>
          {filtered.length > 400 && (
            <p className="text-center text-[11px] text-rw-ink-soft pt-3">先頭400語を表示（範囲・検索で絞ってください）</p>
          )}
        </section>
      </div>
    </div>
  );
}

function DoorLink({ to, emoji, label, sub }: { to: string; emoji: string; label: string; sub: string }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-rw-rule bg-rw-paper p-3 text-center no-underline"
      style={{ textDecoration: "none" }}
    >
      <div className="text-xl">{emoji}</div>
      <div className="text-[13px] font-black text-rw-ink mt-0.5">{label}</div>
      <div className="text-[10px] text-rw-ink-soft font-semibold">{sub}</div>
    </Link>
  );
}

function DoorButton({ emoji, label, sub, onClick }: { emoji: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-rw-rule bg-rw-paper p-3 text-center"
    >
      <div className="text-xl">{emoji}</div>
      <div className="text-[13px] font-black text-rw-ink mt-0.5">{label}</div>
      <div className="text-[10px] text-rw-ink-soft font-semibold">{sub}</div>
    </button>
  );
}

function NumberStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-2 border border-rw-rule rounded-lg px-2 py-1">
      <button onClick={() => onChange(value - 1)} className="text-rw-accent font-black w-5 text-lg leading-none">−</button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 1)}
        className="w-11 text-center font-black text-rw-ink bg-transparent outline-none"
      />
      <button onClick={() => onChange(value + 1)} className="text-rw-accent font-black w-5 text-lg leading-none">＋</button>
    </span>
  );
}

function QuickRange({ label, on }: { label: string; on: () => void }) {
  return (
    <button
      onClick={on}
      className="text-[10.5px] font-black px-2.5 py-1 rounded-full border border-rw-rule text-rw-ink bg-rw-bg"
    >
      {label}
    </button>
  );
}
