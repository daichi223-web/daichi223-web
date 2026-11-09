import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { logEvent } from "@/lib/learningEvents";

type LoadError = "not-found" | "intercepted" | "network";

interface GlossaryEntry {
  term: string;
  reading: string;
  meaning: string;
}

interface GuideSection {
  heading: string;
  content?: string[];
  glossary?: GlossaryEntry[];
}

/** 和歌教材の「歌ごとの解説」（2026-11-08〜）。正本は vault の教材 MD、変換は scripts/poem-guides.mjs */
interface PoemGuideItem {
  no: number;
  text: string;
  author?: string;
  /** texts-v3 の文ID（本文の該当箇所へ飛ぶ） */
  refs: string[];
  fields: { key: string; label: string; body: string }[];
}
interface PoemGuideSection {
  heading: string;
  items: PoemGuideItem[];
}

interface GuideData {
  textId: string;
  title: string;
  source: string;
  sections: {
    background?: GuideSection;
    learningPoints?: GuideSection;
    characters?: GuideSection;
    poems?: PoemGuideSection;
  };
}

const sectionKeys = ["background", "poems", "learningPoints", "characters"] as const;

type SectionKey = (typeof sectionKeys)[number];

const sectionLabels: Record<SectionKey, string> = {
  background: "出典・背景",
  poems: "歌ごとの解説",
  learningPoints: "学習ポイント",
  characters: "登場人物・敬語",
};

// 各セクションのインジケータカラー (学習根幹のレイヤーカラーを温存)
const sectionIndicatorBg: Record<SectionKey, string> = {
  background: "bg-layer-3",
  poems: "bg-layer-2",
  learningPoints: "bg-kin",
  characters: "bg-layer-4",
};

/** 歌ごとの解説の1首。見出し（歌本文・歌人）を押すと中身が開く */
function PoemGuideCard({ item, textId }: { item: PoemGuideItem; textId: string }) {
  const [open, setOpen] = useState(false);
  const firstRef = item.refs[0];
  return (
    <article className="rounded-xl border-2 border-rw-ink bg-rw-paper overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left px-3 py-2.5 flex items-start gap-2">
        <span className="shrink-0 w-6 h-6 rounded-full bg-rw-ink text-rw-paper text-[11px] font-black flex items-center justify-center mt-0.5">
          {item.no}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-serif text-[15px] leading-relaxed text-rw-ink whitespace-pre-wrap">{item.text}</span>
          {item.author && <span className="block text-[12px] text-rw-ink-soft mt-0.5">{item.author}</span>}
        </span>
        <span className={`text-xs text-rw-ink-soft transition-transform mt-1 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="border-t border-rw-rule px-3 py-3 space-y-3">
          {item.fields.map((f) => (
            <div key={f.key}>
              <div className="text-[11px] font-black text-rw-ink-soft tracking-wider">{f.label}</div>
              <p className="text-sm text-rw-ink/80 whitespace-pre-wrap mt-0.5" style={{ lineHeight: 1.8 }}>
                {f.body}
              </p>
            </div>
          ))}
          {firstRef && (
            <Link
              to={`/read/texts/${textId}#t=${firstRef}-t1`}
              className="inline-block text-[12px] font-black text-rw-primary underline"
            >
              本文のこの歌へ →
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export default function TextGuide() {
  const params = useParams<{ textId: string }>();
  const textId = params.textId ?? "";

  const [guide, setGuide] = useState<GuideData | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("background");
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set());
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    background: null,
    poems: null,
    learningPoints: null,
    characters: null,
  });

  useEffect(() => {
    if (!textId) return;
    logEvent({ area: "text", action: "view", targetType: "guide", targetId: textId });
    fetchJsonAsset<GuideData>(`/guides/${textId}.json`).then((r) => {
      if (r.ok) setGuide(r.data);
      else setLoadError(r.kind);
    });
  }, [textId]);

  useEffect(() => {
    if (!guide) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute("data-section") as SectionKey | null;
          if (id) setActiveSection(id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    const refs = sectionRefs.current;
    sectionKeys.forEach((key) => {
      const el = refs[key];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [guide]);

  const scrollTo = (key: SectionKey) => {
    if (!openSections.has(key)) {
      setOpenSections((prev) => new Set(prev).add(key));
    }
    setTimeout(() => {
      sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loadError) {
    return (
      <div className="min-h-dvh bg-rw-bg flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <Link
            to={`/read/texts/${textId}?layer=1`}
            className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
          >
            ← 本文へ
          </Link>
          {loadError === "not-found" ? (
            <p className="text-rw-ink">解説が見つかりません</p>
          ) : (
            <>
              <p className="text-base font-black text-rw-ink">解説を読み込めませんでした</p>
              <p className="text-sm text-rw-ink-soft leading-relaxed">
                学校などのセキュリティ環境から一部リソースが遮断されている可能性があります。
                時間をおくか、学外ネットワークで再度お試しください。
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-black rounded-full bg-rw-ink text-rw-paper transition-colors"
                style={{ boxShadow: "0 2px 0 var(--rw-primary)" }}
              >
                リロード
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="min-h-dvh bg-rw-bg flex items-center justify-center">
        <p className="text-rw-ink-soft">読み込み中...</p>
      </div>
    );
  }

  const renderSectionContent = (key: SectionKey) => {
    const section = guide.sections[key] as GuideSection | PoemGuideSection | undefined;
    if (!section) return null;
    const isOpen = openSections.has(key);

    if (key === "poems") {
      const poems = section as PoemGuideSection;
      return (
        <section
          key={key}
          ref={(el) => {
            sectionRefs.current[key] = el;
          }}
          data-section={key}
          className="scroll-mt-28"
        >
          <button onClick={() => toggleSection(key)} className="w-full flex items-center gap-3 text-left py-2.5">
            <div className={`w-1 h-6 rounded-sm ${sectionIndicatorBg[key]}`} />
            <h2 className="text-[17px] font-black text-rw-ink flex-1">
              {poems.heading}
              <span className="ml-2 text-[11px] font-bold text-rw-ink-soft">{poems.items.length} 首</span>
            </h2>
            <span className={`text-xs text-rw-ink-soft transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
          </button>
          {isOpen && (
            <div className="pl-4 pb-4 space-y-2">
              {poems.items.map((item) => (
                <PoemGuideCard key={item.no} item={item} textId={textId} />
              ))}
            </div>
          )}
        </section>
      );
    }

    const gs = section as GuideSection;
    return (
      <section
        key={key}
        ref={(el) => {
          sectionRefs.current[key] = el;
        }}
        data-section={key}
        className="scroll-mt-28"
      >
        <button
          onClick={() => toggleSection(key)}
          className="w-full flex items-center gap-3 text-left py-2.5"
        >
          <div className={`w-1 h-6 rounded-sm ${sectionIndicatorBg[key]}`} />
          <h2 className="text-[17px] font-black text-rw-ink flex-1">
            {gs.heading}
          </h2>
          <span
            className={`text-xs text-rw-ink-soft transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        {isOpen && (
          <div className="pl-4 pb-4 space-y-4">
            {gs.content?.map((p, i) => (
              <p
                key={i}
                className="text-sm text-rw-ink/80 whitespace-pre-wrap"
                style={{ lineHeight: 1.8 }}
              >
                {p}
              </p>
            ))}

            {gs.glossary && gs.glossary.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-black text-rw-ink mb-2">用語解説</h3>
                <div className="overflow-hidden rounded-xl border-2 border-rw-ink bg-rw-paper">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-rw-primary-soft text-rw-primary">
                        <th className="text-left px-3 py-2.5 font-black whitespace-nowrap text-[11px]">
                          語
                        </th>
                        <th className="text-left px-3 py-2.5 font-black whitespace-nowrap text-[11px]">
                          読み
                        </th>
                        <th className="text-left px-3 py-2.5 font-black text-[11px]">
                          意味
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {gs.glossary.map((entry, i) => (
                        <tr
                          key={i}
                          className="border-t border-rw-rule"
                        >
                          <td className="px-3 py-2.5 font-bold text-rw-ink whitespace-nowrap">
                            {entry.term}
                          </td>
                          <td className="px-3 py-2.5 text-rw-ink-soft whitespace-nowrap">
                            {entry.reading}
                          </td>
                          <td className="px-3 py-2.5 text-rw-ink/80">
                            {entry.meaning}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-dvh bg-rw-bg flex flex-col max-w-2xl mx-auto">
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 bg-rw-paper border-b-2 border-rw-ink">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <Link
            to={`/read/texts/${textId}?layer=1`}
            className="text-xs font-bold text-rw-ink-soft hover:text-rw-ink transition-colors shrink-0"
          >
            ← 本文へ
          </Link>
          <div className="text-center min-w-0">
            <h1 className="text-sm font-black text-rw-ink truncate">
              {guide.title}
            </h1>
            <p className="text-[10px] text-rw-ink-soft truncate">
              {guide.source} — 解説
            </p>
          </div>
          <Link
            to="/read"
            className="text-xs font-bold text-rw-ink-soft hover:text-rw-ink transition-colors shrink-0"
          >
            トップ
          </Link>
        </div>

        {/* セクションナビ */}
        <nav className="px-4 pb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {sectionKeys
            .filter((key) => !!guide.sections[key])
            .map((key) => {
              const active = activeSection === key;
              return (
                <button
                  key={key}
                  onClick={() => scrollTo(key)}
                  className={`shrink-0 px-3 py-1.5 text-[11px] font-extrabold rounded-full transition-colors ${
                    active
                      ? "bg-rw-ink text-rw-paper"
                      : "bg-rw-paper border border-rw-rule text-rw-ink-soft hover:text-rw-ink"
                  }`}
                  style={
                    active
                      ? { boxShadow: "0 2px 0 var(--rw-primary)" }
                      : undefined
                  }
                >
                  {sectionLabels[key]}
                </button>
              );
            })}
        </nav>
      </header>

      {/* コンテンツ */}
      <main className="flex-1 px-4 py-6 space-y-2">
        {sectionKeys.map((key) => renderSectionContent(key))}
      </main>

      {/* フッター */}
      <footer className="sticky bottom-0 bg-rw-paper border-t border-rw-rule px-4 py-2">
        <div className="flex gap-2 justify-center">
          <Link
            to={`/read/texts/${textId}?layer=1`}
            className="px-4 py-2 text-xs rounded-full bg-rw-ink text-rw-paper font-black transition-colors"
            style={{ boxShadow: "0 2px 0 var(--rw-primary)" }}
          >
            📖 本文を読む
          </Link>
          <Link
            to="/read"
            className="px-4 py-2 text-xs rounded-full bg-rw-paper border-2 border-rw-ink text-rw-ink font-bold transition-colors"
          >
            テキスト一覧へ
          </Link>
        </div>
      </footer>
    </div>
  );
}
