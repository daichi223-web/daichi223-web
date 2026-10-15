/**
 * 語の近くに浮かぶ短い解説カード（試作、2026-10-16〜）。
 * PC はマウスを重ねるだけで出てクリックで固定、スマホは指を当てている間に出てタップで固定。
 * 出すのは要点だけ（語・330の番号・意味・この箇所での決め手・意味の一覧・品詞の表）。
 * 「→ 単語カード」で /word/:lemma へ直接飛び、「もっと」で従来の GrammarPopover を開く。
 * 文の訳はカードに入れず、TextReader の画面下の帯に出す。操作は useWordCard にまとめてある。
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Token, TokenAnalysis } from "@/lib/kobun/types";
import { resolveVocabKey } from "@/lib/vocabAlias";
import { getQuizQidsForLemma } from "@/lib/vocabLookup";
import { enrichGrammarInfo } from "@/lib/kobun/auxiliaryInfo";
import { placeCard } from "@/lib/kobun/wordCardLayout";
import bundledKobunQ from "@/data/kobunQ.v2.slim.json";

type QEntry = { qid: string; lemma: string; group?: number; meaning_idx?: number; senseNorm?: string; sense?: string };
const KOBUN_Q = bundledKobunQ as QEntry[];
let byLemma: Map<string, QEntry[]> | null = null;
function sensesOf(lemma: string, group?: number): QEntry[] {
  if (!byLemma) {
    byLemma = new Map();
    for (const q of KOBUN_Q) {
      if (!q.lemma) continue;
      const arr = byLemma.get(q.lemma) ?? [];
      arr.push(q);
      byLemma.set(q.lemma, arr);
    }
  }
  const all = (byLemma.get(lemma) ?? []).filter((q) => group === undefined || q.group === group);
  all.sort((a, b) => (a.meaning_idx ?? 0) - (b.meaning_idx ?? 0));
  // 同じ意味（活用違いの qid）はひとつにまとめる
  const seen = new Set<string>();
  return all.filter((q) => {
    const k = (q.senseNorm ?? q.sense ?? "").replace(/（.*?）|\(.*?\)/g, "").trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 意味ラベルと単語帳の意味が同じものを指しているか（表記の揺れを少し吸収） */
function sameSense(meaning: string | undefined, norm: string | undefined): boolean {
  if (!meaning || !norm) return false;
  const a = meaning.replace(/[〜～()（）・\s]/g, "");
  const b = norm.replace(/[〜～()（）・\s]/g, "");
  return a === b || a.includes(b) || b.includes(a);
}

export interface WordCardAnchor {
  /** 語の枠（画面座標） */
  rect: DOMRect;
  /** 指やマウスの点（画面座標）。無ければ語の枠の中央 */
  x?: number;
  y?: number;
}

interface WordCardProps {
  token: Token;
  analysis: TokenAnalysis | null;
  anchor: WordCardAnchor;
  /** 固定されている（クリック・タップ）か、重ねている／指を当てている間だけか */
  pinned: boolean;
  /** 指で操作中は上に出す（指と手で隠れないように） */
  preferAbove: boolean;
  /** 画面下の帯などに重ねないための下の余白（px） */
  avoidBottom: number;
  onClose: () => void;
  onMore: () => void;
}

export function WordCard({ token, analysis, anchor, pinned, preferAbove, avoidBottom, onClose, onMore }: WordCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean; arrowLeft: number } | null>(null);

  const tag = token.grammarTag ?? { pos: "" };
  const vocabKey = resolveVocabKey(token.text, tag.baseForm);
  const qids = vocabKey ? getQuizQidsForLemma(vocabKey, tag.pos) : [];
  const group = qids.length ? Number(qids[0].split("-")[0]) : undefined;
  const senses = vocabKey ? sensesOf(vocabKey, Number.isFinite(group) ? group : undefined) : [];
  const decider = analysis?.decider;
  const enriched = enrichGrammarInfo(tag.pos, token.text, tag.baseForm, tag.conjugationType, tag.conjugationForm, tag.meaning);
  const isGrammar = tag.pos === "助動詞" || /助詞$/.test(tag.pos);

  // 位置：語の下に入れば下、入らなければ上。指で操作中は上を優先。横は点を中心に画面内へ収める
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(
      placeCard({
        rect: anchor.rect,
        point: anchor.x !== undefined && anchor.y !== undefined ? { x: anchor.x, y: anchor.y } : null,
        size: { width: el.offsetWidth, height: el.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        avoidBottom,
        preferAbove,
      }),
    );
  }, [anchor, preferAbove, avoidBottom, token.id]);

  return (
    <div
      ref={ref}
      data-word-card
      role="dialog"
      aria-label={`${token.text} の解説`}
      className="fixed z-40 bg-rw-paper rounded-2xl shadow-lg border-2 border-rw-ink text-rw-ink animate-popover-in"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: "min(92vw, 340px)",
        maxHeight: `calc(100vh - ${avoidBottom + 16}px)`,
        overflowY: "auto",
        padding: "10px 14px 12px",
        fontSize: 14,
        lineHeight: 1.7,
        visibility: pos ? "visible" : "hidden",
        pointerEvents: pinned ? "auto" : "none",
      }}
    >
      {/* 語を指す矢印 */}
      {pos && (
        <span
          aria-hidden
          className="absolute w-3.5 h-3.5 bg-rw-paper border-rw-ink"
          style={{
            left: pos.arrowLeft,
            [pos.below ? "top" : "bottom"]: -8,
            transform: "rotate(45deg)",
            borderWidth: pos.below ? "2px 0 0 2px" : "0 2px 2px 0",
            borderStyle: "solid",
          }}
        />
      )}

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-lg font-black font-serif">{token.text}</span>
        {tag.baseForm && tag.baseForm !== token.text && <span className="text-xs text-rw-ink-soft">← {tag.baseForm}</span>}
        {vocabKey && Number.isFinite(group) ? (
          <span className="text-[11px] font-bold rounded px-1.5" style={{ background: "var(--rw-primary-soft)", color: "var(--rw-primary)" }}>
            No.{group}
          </span>
        ) : (
          tag.pos && <span className="text-[11px] font-bold rounded px-1.5 bg-rw-bg text-rw-ink-soft">{tag.pos}</span>
        )}
        {pinned && (
          <button onClick={onClose} aria-label="閉じる" className="ml-auto text-rw-ink-soft text-base leading-none px-1">
            ✕
          </button>
        )}
      </div>

      {/* 意味（単語）。教材の意味ラベル → 決め手の意味（単語の理由データ）→ 単語帳の意味、の順 */}
      {!isGrammar && (tag.meaning || decider?.meaning || senses.length > 0) && (
        <p className="font-bold mt-0.5">
          意味：{tag.meaning ?? decider?.meaning ?? senses.map((s) => (s.senseNorm ?? s.sense ?? "").replace(/〔|〕/g, "")).join("／")}
        </p>
      )}

      {/* この箇所での決め手（analysis）。無ければ重要ポイント（hint） */}
      {decider?.summary ? (
        <p className="mt-0.5">
          <span className="text-[11px] font-bold text-rw-ink-soft mr-1">決め手</span>
          {decider.summary}
        </p>
      ) : token.hint ? (
        <p className="mt-0.5">
          <span className="text-[11px] font-bold text-rw-ink-soft mr-1">ポイント</span>
          {token.hint}
        </p>
      ) : null}

      {/* 助詞・助動詞：品詞・接続・用法・活用形 */}
      {isGrammar && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-1 text-sm">
          <dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">品詞</dt>
          <dd>{tag.pos}{enriched.conjugationForm ? `（${enriched.conjugationForm}）` : ""}</dd>
          {enriched.connection && (<><dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">接続</dt><dd>{enriched.connection}</dd></>)}
          {tag.meaning && (<><dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">用法</dt><dd>{tag.meaning}</dd></>)}
          {enriched.conjugationType && (<><dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">活用型</dt><dd>{enriched.conjugationType}</dd></>)}
        </dl>
      )}

      {/* 用言：品詞・活用型・活用形（単語帳の語は意味の一覧の前に1行で） */}
      {!isGrammar && (tag.conjugationType || tag.conjugationForm) && (
        <p className="text-xs text-rw-ink-soft mt-0.5">
          {tag.pos}{tag.conjugationType ? `・${tag.conjugationType}` : ""}{tag.conjugationForm ? `・${tag.conjugationForm}` : ""}
        </p>
      )}

      {/* 単語帳の意味の一覧（この箇所の意味を太く）。意味が決まらず一覧を上に出したときは省く */}
      {senses.length > 1 && (tag.meaning || decider?.meaning) && (
        <ol className="mt-1 pl-5 text-[13px] text-rw-ink-soft list-decimal">
          {senses.map((s) => {
            const cur = sameSense(tag.meaning ?? decider?.meaning, s.senseNorm ?? s.sense);
            return (
              <li key={s.qid} className={cur ? "text-rw-ink font-bold" : ""}>
                {(s.senseNorm ?? s.sense ?? "").replace(/〔|〕/g, "")}
              </li>
            );
          })}
        </ol>
      )}

      {/* 固定したときだけ：詳細へ */}
      {pinned ? (
        <div className="flex gap-2 mt-2 pt-2 border-t border-rw-rule text-sm">
          {vocabKey && (
            <Link to={`/word/${encodeURIComponent(vocabKey)}`} className="font-bold" style={{ color: "var(--rw-primary)" }}>
              → 単語カード「{vocabKey}」
            </Link>
          )}
          <button onClick={onMore} className="ml-auto font-bold text-rw-ink-soft">
            もっと ▾
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-rw-ink-soft mt-1">クリックで固定</p>
      )}
    </div>
  );
}
