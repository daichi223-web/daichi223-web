import { useState } from "react";
import type { DeciderCue, DeciderType } from "@/lib/kobun/types";

/** 決め手の型 → 色・下線パターン・説明 */
export const DECIDER_STYLE: Record<
  DeciderType,
  { color: string; pattern: "solid" | "dotted" | "double" | "dashed"; desc: string }
> = {
  後接: { color: "#f43f5e", pattern: "solid", desc: "下に来る語で決まる（つ＋べし→強意 など）" },
  呼応: { color: "#f59e0b", pattern: "dotted", desc: "係助詞・疑問語・呼応副詞・終助詞で決まる" },
  形: { color: "#0ea5e9", pattern: "double", desc: "活用形・接続・語形で決まる（連体形＋体言 など）" },
  主語: { color: "#10b981", pattern: "solid", desc: "主語の人称で決まる（一人称→意志 など）" },
  文脈: { color: "#8b5cf6", pattern: "dashed", desc: "地の文/会話/和歌・場面で決まる" },
};

const TYPES: DeciderType[] = ["後接", "呼応", "形", "主語", "文脈"];

function cueStyle(type: DeciderType): React.CSSProperties {
  const s = DECIDER_STYLE[type] ?? DECIDER_STYLE["文脈"];
  return {
    backgroundColor: s.color + "22",
    borderBottom: `2px ${s.pattern} ${s.color}`,
    borderRadius: "3px 3px 0 0",
    padding: "0 1px",
    cursor: "pointer",
  };
}

/**
 * 例文本文の描画。
 * - 【 ... 】＝判定対象（太字＋プライマリ下線）。
 * - cues があれば、本文中の手がかり語を型の色・下線パターンでハイライト（複数可・タップで理由）。
 * - reveal=false（クイズ出題中）は手がかりを伏せ、判定対象のみ表示。
 * - cues が無い場合は旧 《 ... 》 マークにフォールバック。
 */
export function ReibunSentence({
  text,
  cues,
  reveal = true,
}: {
  text: string;
  cues?: DeciderCue[];
  reveal?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);

  // 判定対象 【】 を保護しつつ、《》ブラケットは除去（cues がハイライトを担う）
  const cleaned = cues && cues.length ? text.replace(/[《》]/g, "") : text;
  const segments = cleaned.split(/(【[^】]*】)/g);

  const textCues = (cues ?? []).map((c, i) => ({ ...c, i })).filter((c) => c.text);
  const textlessCues = (cues ?? []).map((c, i) => ({ ...c, i })).filter((c) => !c.text);

  function renderSeg(seg: string, key: number): React.ReactNode {
    if (!reveal || textCues.length === 0) return <span key={key}>{seg}</span>;
    const out: React.ReactNode[] = [];
    let i = 0;
    let buf = "";
    while (i < seg.length) {
      // 最長一致の手がかりを探す
      let hit: { c: (typeof textCues)[number]; len: number } | null = null;
      for (const c of textCues) {
        if (c.text && seg.startsWith(c.text, i) && (!hit || c.text.length > hit.len))
          hit = { c, len: c.text.length };
      }
      if (hit) {
        if (buf) {
          out.push(buf);
          buf = "";
        }
        const idx = hit.c.i;
        out.push(
          <mark
            key={`${key}-${i}`}
            style={cueStyle(hit.c.type)}
            onClick={() => setActive((a) => (a === idx ? null : idx))}
            title={`${hit.c.type}：${hit.c.note}`}
          >
            {hit.c.text}
          </mark>
        );
        i += hit.len;
      } else {
        buf += seg[i];
        i++;
      }
    }
    if (buf) out.push(buf);
    return <span key={key}>{out}</span>;
  }

  const activeCue = active != null ? (cues ?? [])[active] : null;

  return (
    <>
      {segments.map((p, i) =>
        p.startsWith("【") && p.endsWith("】") ? (
          <span
            key={i}
            className="font-black text-rw-ink underline decoration-2 decoration-[var(--rw-primary)] underline-offset-2"
          >
            {p.slice(1, -1)}
          </span>
        ) : (
          renderSeg(p, i)
        )
      )}

      {/* 語の無い手がかり（文脈・主語省略など）はチップで */}
      {reveal && textlessCues.length > 0 && (
        <span className="inline-flex gap-1 ml-1.5 align-middle">
          {textlessCues.map((c) => (
            <button
              key={c.i}
              onClick={() => setActive((a) => (a === c.i ? null : c.i))}
              className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: DECIDER_STYLE[c.type].color + "22", color: DECIDER_STYLE[c.type].color }}
            >
              {c.type}
            </button>
          ))}
        </span>
      )}

      {/* タップで理由 */}
      {reveal && activeCue && (
        <span
          className="block mt-1.5 text-[12px] text-rw-ink leading-relaxed rounded-lg px-2.5 py-1.5"
          style={{ backgroundColor: DECIDER_STYLE[activeCue.type].color + "14", borderLeft: `3px solid ${DECIDER_STYLE[activeCue.type].color}` }}
        >
          <b style={{ color: DECIDER_STYLE[activeCue.type].color }}>【{activeCue.type}】</b>
          {activeCue.text ? `「${activeCue.text}」` : ""}　{activeCue.note}
        </span>
      )}
    </>
  );
}

/** 凡例（型→色・パターン） */
export function ReibunLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-rw-ink-soft">
      <span>
        <span className="font-black text-rw-ink underline decoration-2 decoration-[var(--rw-primary)]">太字</span>
        ＝判定する語
      </span>
      {TYPES.map((t) => (
        <span key={t} className="inline-flex items-center gap-1">
          <span
            style={{
              display: "inline-block",
              width: 18,
              borderBottom: `3px ${DECIDER_STYLE[t].pattern} ${DECIDER_STYLE[t].color}`,
            }}
          />
          {t}
        </span>
      ))}
      <span className="w-full text-[10px] text-rw-ink-soft/80">手がかりをタップで理由が出ます</span>
    </div>
  );
}
