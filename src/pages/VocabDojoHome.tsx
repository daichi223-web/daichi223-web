import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDojoTopicIds, getAllTopicProgress } from "@/lib/kobun/dojoData";
import type { TopicProgress } from "@/lib/kobun/types";

// 単語道場ホーム。
// 弁別クラスター（grammar_drills の vocab-* トピック）を「教程順」に並べる単語側の入口。
// ドリル本体・進捗・SRS は文法道場と同じ基盤（/read/grammar/:topicId）を共有する。

interface Course {
  id: string;
  no: number;
  title: string;
  hook: string;   // 1行の売り文句（何と何を見分けるか）
  kimete: string; // この講の「意味の決まり方」
  emoji: string;
}

const COURSES: Course[] = [
  { id: "vocab-kokon",    no: 1, title: "古今異義語①", hook: "ありがたし・うつくし・やがて——現代語の罠を撃ち落とす", kimete: "現代語の意味が浮かんだら疑う", emoji: "🪤" },
  { id: "vocab-kokon-2",  no: 2, title: "古今異義語②", hook: "おどろく・あく・ながむ・ときめく——罠の第2波", kimete: "共起語（風の音・寝たるに…）が決める", emoji: "🪤" },
  { id: "vocab-shiten",   no: 3, title: "視点で反転する語", hook: "かたはらいたし・まばゆし——見る側か、見られる側か", kimete: "誰の視点の痛みかが決める", emoji: "👀" },
  { id: "vocab-dan",      no: 4, title: "段で意味が変わる語", hook: "たまふ・かづく・たのむ——四段か下二段か", kimete: "活用の形（たまふる＝下二段）が決める", emoji: "⚖️" },
  { id: "vocab-kinsetsu", no: 5, title: "似た者どうしの見分け", hook: "をかし/あはれ、やすらふ/ためらふ、美の三段", kimete: "ペアの「違いの軸」が決める", emoji: "🎭" },
  { id: "vocab-koou",     no: 6, title: "呼応で決まる語", hook: "え・よも・ゆめ・いかで——文末を見てから訳す", kimete: "文末（打消・禁止・願望）が決める", emoji: "🔗" },
  { id: "vocab-tagi",     no: 7, title: "多義語の文脈判別", hook: "よし・けしき・ほど・かぎり——決め手で意味を選ぶ", kimete: "文脈の決め手（型＋手がかり）が決める", emoji: "🧭" },
];

/** 意味の決まり方 5つの型（この道場の背骨） */
const KIMETE_TYPES: { label: string; example: string }[] = [
  { label: "呼応", example: "え〜ず／よも〜じ（文末が決める）" },
  { label: "共起語", example: "寝たるに＋おどろく→目覚める" },
  { label: "対象", example: "御衣＋奉る→お召しになる" },
  { label: "視点", example: "見る側→気の毒／見られる側→恥ずかしい" },
  { label: "活用の形", example: "たまふる→下二段「ております」" },
];

function statusOf(p: TopicProgress | undefined): { label: string; cls: string } {
  if (!p || (p.drillTotal === 0 && !p.watched)) return { label: "未学習", cls: "text-rw-ink-soft" };
  if (p.masteryPct >= 85) return { label: "定着", cls: "text-rw-accent" };
  return { label: `学習中 ${p.masteryPct}%`, cls: "text-rw-primary" };
}

export default function VocabDojoHome() {
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ids, prog] = await Promise.all([fetchDojoTopicIds(), getAllTopicProgress()]);
      if (cancelled) return;
      setAvailable(new Set(ids));
      setProgress(prog);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const doneCount = COURSES.filter((c) => (progress[c.id]?.masteryPct ?? 0) >= 85).length;

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-5">
          <Link to="/" className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← ホーム
          </Link>
          <div className="mt-3 flex items-baseline justify-between">
            <h1 className="text-[30px] font-black tracking-tight text-rw-ink leading-none">🎯 単語道場</h1>
            <span className="text-xs font-black text-rw-ink-soft">定着 {doneCount} / {COURSES.length}</span>
          </div>
          <p className="text-xs font-semibold text-rw-ink-soft mt-2 leading-relaxed">
            訳語の丸暗記から、文脈で見分ける力へ。紛らわしい単語を「紛らわしさごと」に対決させる。
          </p>
        </header>

        {/* 見分ける前に理解する — 単語ホームへ（語の一覧はそちらが正） */}
        <Link
          to="/vocab"
          className="block bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 mb-5 no-underline"
          style={{ textDecoration: "none" }}
        >
          <h2 className="text-sm font-black text-rw-ink mb-1">🧭 その前に、単語を理解する ▶</h2>
          <p className="text-[11px] text-rw-ink-soft font-semibold leading-snug">
            核イメージから意味がどう分かれるか、<span className="font-black">なぜその意味になるか</span>を、問う前に読む。
          </p>
        </Link>

        {/* 意味はどこで決まる？ — 5つの型 */}
        <section className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 mb-5">
          <h2 className="text-sm font-black text-rw-ink mb-2">意味はどこで決まる？ —— 5つの型</h2>
          <div className="space-y-1.5">
            {KIMETE_TYPES.map((t) => (
              <div key={t.label} className="flex items-baseline gap-2 text-[12px] leading-snug">
                <span
                  className="shrink-0 font-black px-2 py-0.5 rounded-full text-[11px]"
                  style={{ background: "var(--rw-primary-soft)", color: "var(--rw-primary)" }}
                >
                  {t.label}
                </span>
                <span className="text-rw-ink font-semibold">{t.example}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-rw-ink-soft mt-2 leading-snug">
            ドリルの例文では <span className="font-black text-rw-primary">赤太字</span>＝問われる語、
            <span className="font-bold text-rw-accent underline decoration-2 underline-offset-2">下線</span>＝意味を決める手がかり。
            まず自分で手がかりを探してから答えよう。
          </p>
        </section>

        {/* 教程 */}
        <div className="space-y-2.5">
          {COURSES.map((c) => {
            const ready = available.has(c.id);
            const st = statusOf(progress[c.id]);
            const inner = (
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "var(--rw-primary-soft)" }}
                >
                  {c.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-black text-rw-ink-soft shrink-0">第{c.no}講</span>
                    <span className="text-[16px] font-black text-rw-ink leading-tight truncate">{c.title}</span>
                  </div>
                  <p className="text-[11px] text-rw-ink-soft font-semibold mt-0.5 leading-snug">{c.hook}</p>
                  <p className="text-[10px] mt-1 leading-snug">
                    <span className="font-black" style={{ color: "var(--rw-accent)" }}>決め手</span>
                    <span className="text-rw-ink-soft font-semibold">　{c.kimete}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {ready ? (
                    <span className={`text-[11px] font-black ${st.cls}`}>{loading ? "…" : st.label}</span>
                  ) : (
                    <span className="text-[11px] font-black text-rw-ink-soft opacity-60">準備中</span>
                  )}
                  <div className="text-rw-ink-soft text-sm mt-1">{ready ? "▶" : ""}</div>
                </div>
              </div>
            );
            return ready ? (
              <Link
                key={c.id}
                to={`/read/grammar/${c.id}`}
                className="block bg-rw-paper border border-rw-rule rounded-2xl p-3.5 hover:border-rw-ink transition no-underline"
                style={{ textDecoration: "none" }}
              >
                {inner}
              </Link>
            ) : (
              <div key={c.id} className="block bg-rw-paper border border-rw-rule rounded-2xl p-3.5 opacity-70">
                {inner}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-rw-ink-soft mt-5 leading-relaxed">
          進捗・復習は文法道場と共通（解いた問題は同じSRSの箱に入る）。実戦編（読んでいる本文からの出題）は準備中。
        </p>
      </div>
    </div>
  );
}
