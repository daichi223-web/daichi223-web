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
  /** 指（タッチ）で出したカードか。月の琴と同じく、指のときは固定しても上を優先し（指と手で隠れないように）、「クリックで固定」は出さない */
  touch: boolean;
  /** 画面下の帯などに重ねないための下の余白（px） */
  avoidBottom: number;
  onClose: () => void;
  onMore: () => void;
  /** 前・次の単語帳の語へ（固定中だけ） */
  onPrev?: () => void;
  onNext?: () => void;
}

/** 見出し番号の札・帯のボタン（月の琴の試作と同じ見た目。2026-10-16 ユーザー指定） */
const BADGE = { background: "color-mix(in srgb, var(--layer-1) 14%, transparent)", color: "var(--layer-1)" } as const;
const BAR_BTN = "min-w-[40px] h-9 px-2 rounded-lg border border-rw-ink/20 bg-rw-paper text-rw-ink text-base leading-none active:scale-95";

export function WordCard({ token, analysis, anchor, pinned, touch, avoidBottom, onClose, onMore, onPrev, onNext }: WordCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean; arrowLeft: number } | null>(null);
  const preferAbove = touch;
  // カード全体の高さの上限（月の琴と同じ min(52dvh, 440px)）。中身が長いときはカードの中だけがスクロールする
  const maxH = Math.min(window.innerHeight * 0.52, 440, window.innerHeight - avoidBottom - 16);

  const tag = token.grammarTag ?? { pos: "" };
  const vocabKey = resolveVocabKey(token.text, tag.baseForm, tag.pos);
  const qids = vocabKey ? getQuizQidsForLemma(vocabKey, tag.pos) : [];
  const group = qids.length ? Number(qids[0].split("-")[0]) : undefined;
  const senses = vocabKey ? sensesOf(vocabKey, Number.isFinite(group) ? group : undefined) : [];
  const decider = analysis?.decider;
  // 理由データが「単語帳の意味（…）とは別に、」で始まる語は、本文では単語帳の見出しと別の語（同形異語・接尾語など）。
  // 見出し番号と意味の一覧は出さず、単語カードへのリンクだけ残す（「単語帳の○○とは別」と分かるように）
  const offList = !!decider?.summary && /^単語帳の意味/.test(decider.summary);
  const enriched = enrichGrammarInfo(tag.pos, token.text, tag.baseForm, tag.conjugationType, tag.conjugationForm, tag.meaning);
  const isGrammar = tag.pos === "助動詞" || /助詞$/.test(tag.pos);

  // 位置：語の下に入れば下、入らなければ上。指で操作中は上を優先。横は点を中心に画面内へ収める
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 画面下のボタン列の実際の高さ（スマホでは2段になる）と、上の固定ヘッダの高さを測り、その間に収める
    const foot = document.querySelector("footer");
    const footH = foot ? Math.max(0, window.innerHeight - foot.getBoundingClientRect().top) : 0;
    const head = document.querySelector("header");
    const headH = head ? Math.max(0, head.getBoundingClientRect().bottom) : 0;
    if (bodyRef.current) bodyRef.current.scrollTop = 0; // 語が変わったら中身は先頭から
    setPos(
      placeCard({
        rect: anchor.rect,
        point: anchor.x !== undefined && anchor.y !== undefined ? { x: anchor.x, y: anchor.y } : null,
        size: { width: el.offsetWidth, height: el.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        avoidBottom: Math.max(avoidBottom, footH),
        avoidTop: headH,
        preferAbove,
      }),
    );
    // pinned：固定すると上の帯とリンクの行が足されて背が伸びるので置き直す（月の琴もタップ時に place() をやり直す）
  }, [anchor, preferAbove, avoidBottom, token.id, pinned]);

  return (
    <div
      ref={ref}
      data-word-card
      role="dialog"
      aria-label={`${token.text} の解説`}
      className="fixed z-40 flex flex-col bg-rw-paper rounded-2xl border border-rw-ink/20 text-rw-ink animate-popover-in"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: "min(92vw, 360px)",
        margin: 0, // 親の space-y-* の margin-top が fixed にも効いて 12px 下にずれるのを防ぐ
        maxHeight: maxH,
        overflow: "visible", // 矢印は枠の外に出る。スクロールは中の bodyRef だけ（外側を overflow:auto にすると矢印が切れる）
        fontSize: 15,
        lineHeight: 1.75,
        boxShadow: "0 10px 32px rgba(40,25,10,.22)",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        visibility: pos ? "visible" : "hidden",
        pointerEvents: pinned ? "auto" : "none",
      }}
    >
      {/* 語を指す矢印（中身の後ろに置く。月の琴と同じ z-index:-1） */}
      {pos && (
        <span
          aria-hidden
          className="absolute w-3.5 h-3.5 bg-rw-paper border-rw-ink/20"
          style={{
            left: pos.arrowLeft,
            [pos.below ? "top" : "bottom"]: -8,
            transform: "rotate(45deg)",
            borderWidth: pos.below ? "1px 0 0 1px" : "0 1px 1px 0",
            borderStyle: "solid",
            zIndex: -1,
          }}
        />
      )}

      {/* 固定したとき：上の帯（‹ › ✕）。スクロールする中身の外に置く */}
      {pinned && (
        <div className="flex items-center gap-2 py-2 px-4 border-b border-rw-ink/15 shrink-0">
          <span className="flex-1 text-[13px] text-rw-ink-soft">{touch ? "タップ" : "クリック"}した語の説明</span>
          {onPrev && <button onClick={onPrev} aria-label="前の語" className={BAR_BTN}>‹</button>}
          {onNext && <button onClick={onNext} aria-label="次の語" className={BAR_BTN}>›</button>}
          <button onClick={onClose} aria-label="閉じる" className={BAR_BTN}>✕</button>
        </div>
      )}

      <div
        ref={bodyRef}
        className="min-h-0 flex-1"
        style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: pinned ? "8px 16px 14px" : "12px 16px 14px" }}
      >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[22px] font-serif leading-tight">{token.text}</span>
        {tag.baseForm && tag.baseForm !== token.text && <span className="text-xs text-rw-ink-soft">← {tag.baseForm}</span>}
        {vocabKey && Number.isFinite(group) && !offList ? (
          <span className="text-[13px] rounded-md px-2 py-0.5" style={BADGE}>No.{group}</span>
        ) : (
          tag.pos && <span className="text-[12px] rounded-md px-2 py-0.5 bg-rw-bg text-rw-ink-soft">{tag.pos}</span>
        )}
      </div>

      {/* 意味（単語）。教材の意味ラベル → 決め手の意味（単語の理由データ）→ 単語帳の意味、の順 */}
      {!isGrammar && (tag.meaning || decider?.meaning || senses.length > 0) && (
        <p className="font-bold text-[20px] leading-snug mt-1.5">
          <span className="text-[13px] text-rw-ink-soft mr-1.5 align-middle">意味</span>
          {tag.meaning ?? decider?.meaning ?? senses.map((s) => (s.senseNorm ?? s.sense ?? "").replace(/〔|〕/g, "")).join("／")}
        </p>
      )}

      {/* この箇所でその意味になる理由（analysis の決め手）。無ければ重要ポイント（hint） */}
      {decider?.summary ? (
        <p className="mt-1">
          <span className="text-[12px] font-bold text-rw-ink-soft mr-1.5">理由</span>
          {decider.summary}
        </p>
      ) : token.hint ? (
        <p className="mt-1">
          <span className="text-[12px] font-bold text-rw-ink-soft mr-1.5">ポイント</span>
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
      {senses.length > 1 && (tag.meaning || decider?.meaning) && !offList && (
        <ol className="mt-2 pl-6 text-[14px] text-rw-ink-soft list-decimal marker:font-normal space-y-0.5">
          {senses.map((s, _i, all) => {
            // 完全に一致する意味があればそれだけを太字に（「生きている」で「いる」まで太字にしない）。無ければ部分一致
            const m = tag.meaning ?? decider?.meaning;
            const key = (x?: string) => (x ?? "").replace(/〔|〕|[〜～()（）\s]/g, "");
            const exact = all.some((x) => key(x.senseNorm ?? x.sense) === key(m));
            const cur = exact ? key(s.senseNorm ?? s.sense) === key(m) : sameSense(m, s.senseNorm ?? s.sense);
            return (
              <li key={s.qid} className={cur ? "text-rw-ink font-bold marker:font-bold" : ""}>
                {(s.senseNorm ?? s.sense ?? "").replace(/〔|〕/g, "")}
              </li>
            );
          })}
        </ol>
      )}

      {/* 固定したときだけ：詳細へ */}
      {pinned ? (
        <div className="flex gap-2 mt-3 pt-2 border-t border-rw-ink/15 text-sm">
          {vocabKey && (
            <Link to={`/word/${encodeURIComponent(vocabKey)}`} className="font-bold" style={{ color: "var(--rw-primary)" }}>
              {offList ? `単語帳の「${vocabKey}」を見る（この箇所とは別の意味）` : `→ 単語カード「${vocabKey}」`}
            </Link>
          )}
          <button onClick={onMore} className="ml-auto font-bold text-rw-ink-soft">
            もっと ▾
          </button>
        </div>
      ) : (
        // 指を当てている間は出さない（月の琴にこの行は無い。「クリック」は指の操作に合わない）
        !touch && <p className="text-[11px] text-rw-ink-soft mt-1">クリックで固定</p>
      )}
      </div>
    </div>
  );
}
