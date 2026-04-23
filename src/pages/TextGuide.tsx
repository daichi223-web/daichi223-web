import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { fetchJsonAsset } from "@/lib/fetchJson";

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

interface GuideData {
  textId: string;
  title: string;
  source: string;
  sections: {
    background?: GuideSection;
    learningPoints?: GuideSection;
    characters?: GuideSection;
  };
}

const sectionKeys = ["background", "learningPoints", "characters"] as const;

type SectionKey = (typeof sectionKeys)[number];

const sectionLabels: Record<SectionKey, string> = {
  background: "出典・背景",
  learningPoints: "学習ポイント",
  characters: "登場人物・敬語",
};

const sectionBorders: Record<SectionKey, string> = {
  background: "border-layer-3",
  learningPoints: "border-kin",
  characters: "border-layer-4",
};

export default function TextGuide() {
  const params = useParams<{ textId: string }>();
  const textId = params.textId ?? "";

  const [guide, setGuide] = useState<GuideData | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("background");
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set());
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    background: null,
    learningPoints: null,
    characters: null,
  });

  useEffect(() => {
    if (!textId) return;
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
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <Link to={`/read/texts/${textId}?layer=1`} className="text-sm text-scaffold hover:text-sumi">
            ← 本文へ
          </Link>
          {loadError === "not-found" ? (
            <p>解説が見つかりません</p>
          ) : (
            <>
              <p className="text-base font-bold">解説を読み込めませんでした</p>
              <p className="text-sm text-scaffold">
                学校などのセキュリティ環境から一部リソースが遮断されている可能性があります。
                時間をおくか、学外ネットワークで再度お試しください。
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm rounded-lg bg-shu text-white hover:bg-shu/90 transition-colors"
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
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-scaffold">読み込み中...</p>
      </div>
    );
  }

  const renderSectionContent = (key: SectionKey) => {
    const section = guide.sections[key];
    if (!section) return null;
    const isOpen = openSections.has(key);

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
          className="w-full flex items-center gap-3 text-left py-3"
        >
          <div className={`w-1 h-6 rounded-full ${sectionBorders[key]} border-l-4`} />
          <h2 className="text-xl font-bold flex-1">{section.heading}</h2>
          <span
            className={`text-sm text-sumi/40 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        {isOpen && (
          <div className="pl-4 pb-4 space-y-4">
            {section.content?.map((p, i) => (
              <p
                key={i}
                className="text-sm leading-relaxed text-sumi/80 whitespace-pre-wrap"
              >
                {p}
              </p>
            ))}

            {section.glossary && section.glossary.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold mb-2">用語解説</h3>
                <div className="overflow-x-auto rounded-lg border border-sumi/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-sumi/5">
                        <th className="text-left px-3 py-2 font-bold whitespace-nowrap">
                          語
                        </th>
                        <th className="text-left px-3 py-2 font-bold whitespace-nowrap">
                          読み
                        </th>
                        <th className="text-left px-3 py-2 font-bold">意味</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.glossary.map((entry, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-sumi/[0.02]" : ""}>
                          <td className="px-3 py-2 font-bold whitespace-nowrap">
                            {entry.term}
                          </td>
                          <td className="px-3 py-2 text-scaffold whitespace-nowrap">
                            {entry.reading}
                          </td>
                          <td className="px-3 py-2 text-sumi/70">{entry.meaning}</td>
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
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto">
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 bg-washi/95 backdrop-blur border-b border-sumi/10">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link
            to={`/read/texts/${textId}?layer=1`}
            className="text-sm text-scaffold hover:text-sumi transition-colors"
          >
            ← 本文へ
          </Link>
          <div className="text-center">
            <h1 className="text-base font-bold">{guide.title}</h1>
            <p className="text-xs text-scaffold">{guide.source} — 解説</p>
          </div>
          <Link
            to="/read"
            className="text-sm text-scaffold hover:text-sumi transition-colors"
          >
            トップ
          </Link>
        </div>

        {/* セクションナビ */}
        <nav className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {sectionKeys
            .filter((key) => !!guide.sections[key])
            .map((key) => (
              <button
                key={key}
                onClick={() => scrollTo(key)}
                className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-full transition-all
                ${
                  activeSection === key
                    ? "bg-sumi text-washi"
                    : "bg-sumi/5 text-sumi/60 hover:bg-sumi/10"
                }`}
              >
                {sectionLabels[key]}
              </button>
            ))}
        </nav>
      </header>

      {/* コンテンツ */}
      <main className="flex-1 px-4 py-6 space-y-2">
        {sectionKeys.map((key) => renderSectionContent(key))}
      </main>

      {/* フッター */}
      <footer className="sticky bottom-0 bg-washi/95 backdrop-blur border-t border-sumi/10 px-4 py-3">
        <div className="flex gap-3 justify-center">
          <Link
            to={`/read/texts/${textId}?layer=1`}
            className="px-4 py-2 text-sm rounded-lg bg-shu text-white hover:bg-shu/90 transition-colors font-bold"
          >
            本文を読む
          </Link>
          <Link
            to="/read"
            className="px-4 py-2 text-sm rounded-lg border border-sumi/20 hover:bg-sumi/5 transition-colors"
          >
            テキスト一覧へ
          </Link>
        </div>
      </footer>
    </div>
  );
}
