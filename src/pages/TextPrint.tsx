/**
 * 品詞分解プリント（/read/texts/:textId/print）
 * 教材データ（texts-v3）から、語ごとの文法ラベル付きの紙面を組む。既定は縦書き（A4横）、?mode=yoko で横書き（A4縦）。
 * 「印刷・PDFで保存」でブラウザの印刷を開く（iPad は共有→PDF でも保存できる）。
 * 紙面の作りは配布プリントの生成スクリプト（F:\A2A\teaching\補助プリント\品詞分解\make_hinshi_pdf.py）と同じ。
 */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { KobunText } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { hinshiLabel, toCells, type HinshiCell } from "@/lib/kobun/hinshiLabel";
import { circled, findKoou, koouMarks } from "@/lib/kobun/koou";

const COLORS = { yo: "#1f5fbf", jd: "#c62828", js: "#2e7d32", kei: "#7b1fa2", koou: "#d35400" };

// 縦書きの印刷は html ごと vertical-rl にしないとページ送りが効かない（Chrome/Safari とも）。
// ただし画面で html を vertical-rl にすると、iOS Safari で上のボタン帯のタップ位置がずれて押せない。
// そこで画面では html は横書きのまま、紙面（.hp-page）だけを縦書きの横スクロール枠にし、html の縦書きは印刷時だけにする。
// この画面にいる間だけ html に class を付け、離れたら外す。
const CSS = `
.hp-root { font-family: "Noto Serif JP", "Yu Mincho", "YuMincho", serif; color: #111; background: #fff; }
.hp-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hp-bar { font-family: "Noto Sans JP", sans-serif; writing-mode: horizontal-tb; position: sticky; top: 0; z-index: 10;
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 12px; background: #fff; border-bottom: 2px solid #111; }
.hp-bar a, .hp-bar button { touch-action: manipulation; font-size: 13px; font-weight: 700; border: 2px solid #111; border-radius: 999px; padding: 6px 14px; background: #fff; color: #111; }
.hp-bar .hp-primary { background: #111; color: #fff; }
.hp-bar .hp-note { font-size: 11px; color: #555; }
.hp-page { padding: 12mm; }
.hp-page h1 { font-size: 20pt; margin: 0; letter-spacing: .12em; }
.hp-meta { font-size: 9.5pt; color: #444; }
.hp-legend { font-family: "Noto Sans JP", sans-serif; font-size: 7.5pt; color: #333; line-height: 1.7; }
.hp-legend span { display: inline-block; }
.hp-legend i { display: inline-block; width: 3mm; height: 3mm; border-radius: .6mm; }
.hp-sent { display: flex; gap: 2.5mm; break-inside: avoid; }
.hp-no { font-family: "Noto Sans JP", sans-serif; font-size: 8pt; font-weight: 700; color: #fff; background: #333; border-radius: 50%;
  width: 5mm; height: 5mm; line-height: 5mm; text-align: center; flex: none; }
.hp-main { flex: 1; }
.hp-orig { font-size: 10pt; color: #555; line-height: 1.6; }
.hp-row { display: flex; flex-wrap: wrap; align-items: flex-start; row-gap: 2mm; }
.hp-cell { display: inline-flex; flex-direction: column; align-items: center; }
.hp-cell:last-child { border: none !important; }
.hp-wl { display: flex; align-items: flex-start; white-space: nowrap; }
.hp-w, .hp-p { font-size: 15pt; line-height: 1.25; white-space: nowrap; }
.hp-lab { font-family: "Noto Sans JP", sans-serif; display: flex; flex-direction: column; align-items: center; font-size: 7pt; line-height: 1.25; white-space: nowrap; }
.hp-l1 { font-weight: 700; }
.hp-l3 { color: #666; font-size: 6.3pt; }
.hp-mk { color: ${COLORS.koou}; font-weight: 700; font-size: 7pt; }
.hp-koou { font-family: "Noto Sans JP", sans-serif; font-size: 8pt; color: ${COLORS.koou}; line-height: 1.6; }
.hp-koou b { margin-inline-end: 2mm; }
.hp-koou span { margin-inline-end: 3mm; }
.hp-yo .hp-w { border-color: ${COLORS.yo}; } .hp-yo .hp-l1 { color: ${COLORS.yo}; }
.hp-jd .hp-w { border-color: ${COLORS.jd}; } .hp-jd .hp-l1 { color: ${COLORS.jd}; }
.hp-js .hp-w { border-color: ${COLORS.js}; } .hp-js .hp-l1 { color: ${COLORS.js}; }
.hp-kei .hp-w { border-color: ${COLORS.kei}; } .hp-kei .hp-l1, .hp-kei .hp-l2 { color: ${COLORS.kei}; }
.hp-etc .hp-l1 { color: #555; }
.hp-tr { font-size: 9pt; color: #333; background: #f3f3f3; border-radius: 1mm; line-height: 1.6; }
.hp-foot { font-family: "Noto Sans JP", sans-serif; font-size: 7pt; color: #777; }

/* 縦書き */
html.hp-tate .hp-page { writing-mode: vertical-rl; }
html.hp-tate .hp-page h1 { margin-left: 1mm; }
html.hp-tate .hp-meta { margin-block-end: 2mm; }
html.hp-tate .hp-legend { border-block-end: 1.2pt solid #111; padding-block-end: 2mm; margin-block-end: 3mm; }
html.hp-tate .hp-legend span { margin-block-end: 1mm; margin-inline-end: 4mm; }
html.hp-tate .hp-legend i { margin-block-end: 1mm; }
html.hp-tate .hp-sent { padding-block: 2.2mm 2.6mm; border-block-end: .4pt solid #bbb; }
html.hp-tate .hp-no { text-combine-upright: all; }
html.hp-tate .hp-orig { margin-block-end: 1.2mm; }
html.hp-tate .hp-cell { padding-inline: .9mm; border-inline-end: .5pt dashed #999; }
html.hp-tate .hp-w { padding-inline: .3mm; border-block-end: 1.6pt solid transparent; }
html.hp-tate .hp-lab { margin-block-start: .4mm; }
html.hp-tate .hp-tr { padding: 2mm 1.2mm; margin-block-start: 1.8mm; }
html.hp-tate .hp-koou { margin-block-start: 1.6mm; }
html.hp-tate .hp-foot { margin-block-start: 3mm; }

/* 横書き */
html.hp-yoko .hp-meta { margin-bottom: 2mm; }
html.hp-yoko .hp-legend { border-bottom: 1.2pt solid #111; padding-bottom: 2mm; margin-bottom: 3mm; }
html.hp-yoko .hp-legend span { margin-right: 4mm; }
html.hp-yoko .hp-legend i { margin-right: 1mm; vertical-align: -0.4mm; }
html.hp-yoko .hp-sent { padding: 2.2mm 0 2.6mm; border-bottom: .4pt solid #bbb; }
html.hp-yoko .hp-no { margin-top: 1mm; }
html.hp-yoko .hp-orig { margin-bottom: 1.2mm; }
html.hp-yoko .hp-cell { padding: 0 .9mm; border-right: .5pt dashed #999; }
html.hp-yoko .hp-w { padding: 0 .3mm; border-bottom: 1.6pt solid transparent; }
html.hp-yoko .hp-lab { margin-top: .4mm; }
html.hp-yoko .hp-koou { margin-top: 1.4mm; }
html.hp-yoko .hp-tr { padding: 1.2mm 2mm; margin-top: 1.8mm; line-height: 1.5; }
html.hp-yoko .hp-foot { margin-top: 3mm; }

@media screen {
  html.hp-tate .hp-root { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
  html.hp-tate .hp-bar { flex: none; }
  html.hp-tate .hp-page { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
}
@media print {
  html.hp-tate { writing-mode: vertical-rl; }
  .hp-bar { display: none !important; }
  .hp-page { padding: 0; }
  html, body { background: #fff !important; }
}
`;

/**
 * 上のボタン帯のタップ。iOS Safari は紙面の横スクロールが惰性で動いている間のタップを
 * 「スクロールを止める操作」に使い、click を出さないことがある。指を離した時点（pointerup）で動かし、
 * 続いて来る click は捨てる。マウス・キーボードは従来どおり click で動く。
 */
function useTap() {
  const down = useRef<{ x: number; y: number; el: EventTarget } | null>(null);
  const firedAt = useRef(0);
  return (action: () => void) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      down.current = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY, el: e.currentTarget };
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || d.el !== e.currentTarget || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
      firedAt.current = Date.now();
      action();
    },
    onClick: (e: ReactMouseEvent) => {
      // リンクの Ctrl/⌘/Shift+クリック（新しいタブ・窓で開く）はブラウザに任せる
      if (e.currentTarget instanceof HTMLAnchorElement && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
      e.preventDefault();
      if (Date.now() - firedAt.current < 800) return;
      action();
    },
  });
}

function Cell({ c, marks }: { c: HinshiCell; marks?: string[] }) {
  if (!c.token) {
    return (
      <span className="hp-cell hp-none">
        <span className="hp-w">{c.pre}</span>
      </span>
    );
  }
  const l = hinshiLabel(c.token);
  return (
    <span className={`hp-cell hp-${l.kind}`}>
      <span className="hp-wl">
        {c.pre && <span className="hp-p">{c.pre}</span>}
        <span className="hp-w">{c.text}</span>
        {c.punct && <span className="hp-p">{c.punct}</span>}
      </span>
      <span className="hp-lab">
        {l.top && <span className="hp-l1">{l.top}</span>}
        {l.bottom && <span className="hp-l2">{l.bottom}</span>}
        {l.base && <span className="hp-l3">〔{l.base}〕</span>}
        {marks?.map((m) => (
          <span className="hp-mk" key={m}>{m}</span>
        ))}
      </span>
    </span>
  );
}

export default function TextPrint() {
  const { textId = "" } = useParams<{ textId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const yoko = searchParams.get("mode") === "yoko";
  const [text, setText] = useState<KobunText | null>(null);
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const tap = useTap();

  useEffect(() => {
    if (!textId) return;
    fetchJsonAsset<KobunText>(`/texts-v3/${textId}.json`).then((r) => {
      if (r.ok) setText(r.data);
      else setError(true);
    });
  }, [textId]);

  useEffect(() => {
    const cls = yoko ? "hp-yoko" : "hp-tate";
    document.documentElement.classList.add(cls);
    return () => document.documentElement.classList.remove(cls);
  }, [yoko]);

  useEffect(() => {
    if (text) document.title = `${text.title}　品詞分解`;
  }, [text]);

  const page = yoko ? "@page { size: A4; margin: 14mm 13mm; }" : "@page { size: A4 landscape; margin: 12mm; }";
  const meta = text
    ? [text.source, (text as KobunText & { author?: string }).author, (text as KobunText & { era?: string }).era && `${(text as KobunText & { era?: string }).era}時代`]
        .filter(Boolean)
        .join("　")
    : "";

  return (
    <div className="hp-root">
      <style>{CSS + page}</style>
      <div className="hp-bar">
        <Link to={`/read/texts/${textId}`} {...tap(() => navigate(`/read/texts/${textId}`))}>← 教材へ</Link>
        <button className="hp-primary" {...tap(() => window.print())} disabled={!text}>
          印刷・PDFで保存
        </button>
        <button {...tap(() => setSearchParams(yoko ? {} : { mode: "yoko" }, { replace: true }))}>
          {yoko ? "縦書きにする" : "横書きにする"}
        </button>
        <span className="hp-note">印刷の画面で「PDFに保存」を選ぶとPDFになります</span>
      </div>
      {error && <p style={{ padding: 16 }}>教材を読み込めませんでした。</p>}
      {text && (
        <div className="hp-page">
          <h1>{text.title}</h1>
          <div className="hp-meta">{meta}　｜　品詞分解</div>
          <div className="hp-legend">
            <span><i style={{ background: COLORS.yo }} />用言（活用の種類・活用形・〔終止形〕）</span>
            <span><i style={{ background: COLORS.jd }} />助動詞（意味・活用形）</span>
            <span><i style={{ background: COLORS.js }} />助詞（種類・はたらき）</span>
            <span><i style={{ background: COLORS.kei }} />敬語</span>
            <span>無印＝名詞など</span>
            <span>活用形：未・用・終・体・已・命</span>
            <span style={{ color: COLORS.koou }}>係①…結①＝係り結び　断＝断定「に」＋あり　呼＝呼応の副詞</span>
          </div>
          {text.sentences.map((s, i) => {
            const koou = findKoou(s.tokens);
            const marks = koouMarks(koou);
            return (
            <section className="hp-sent" key={s.id}>
              <div className="hp-no">{i + 1}</div>
              <div className="hp-main">
                <div className="hp-orig">{s.originalText}</div>
                <div className="hp-row">
                  {toCells(s.tokens).map((c, k) => (
                    <Cell c={c} key={k} marks={c.token ? marks.get(c.token.id) : undefined} />
                  ))}
                </div>
                {koou.length > 0 && (
                  <div className="hp-koou">
                    <b>呼応</b>
                    {koou.map((k) => (
                      <span key={k.no}>{circled(k.no)}{k.note}</span>
                    ))}
                  </div>
                )}
                {s.modernTranslation && <div className="hp-tr">訳　{s.modernTranslation}</div>}
              </div>
            </section>
            );
          })}
          <div className="hp-foot">古文単（kobun-tan）教材データから作成</div>
        </div>
      )}
    </div>
  );
}
