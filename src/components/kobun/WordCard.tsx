/**
 * 語の近くに浮かぶ短い解説カード（試作、2026-10-16〜）。
 * PC はマウスを重ねるだけで出てクリックで固定、スマホは指を当てている間に出てタップで固定。
 * 出すのは要点だけ（語・330の番号・意味・この箇所での決め手・意味の一覧・品詞の表）。
 * 固定したときの下の行は行き先だけ：単語帳の語は「単語カード」「単語クイズ」、文法の語は「文法解説」「文法のクイズ」。
 * 「もっと」（従来の GrammarPopover）は 2026-10-25 にやめた（中身がカードとほぼ同じで、違いはボタンだけだったため）。
 * 文の訳はカードに入れず、TextReader の画面下の帯に出す。操作は useWordCard にまとめてある。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { grammarMeaningLabel } from "@/lib/kobun/grammarMeaningLabel";
import { Link, useLocation } from "react-router-dom";
import { makeReturnTo, quizUrlWithReturn } from "@/lib/returnTo";
import type { Token, TokenAnalysis } from "@/lib/kobun/types";
import { resolveVocabKey } from "@/lib/vocabAlias";
import { getQuizQidsForLemma } from "@/lib/vocabLookup";
import { enrichGrammarInfo } from "@/lib/kobun/auxiliaryInfo";
import { placeCard, type Placement } from "@/lib/kobun/wordCardLayout";
import { grammarQuizTopicOf } from "@/lib/kobun/grammarQuizTopic";
import { cardSenses } from "@/lib/kobun/wordCardSenses";

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
  /** 前・次の単語帳の語へ（固定中だけ） */
  onPrev?: () => void;
  onNext?: () => void;
}

/** 見やすさ案B（2026-10-25）：理由の囲み（金色の左線）・見出し・手がかりの波線（本文の波線と同じ）・この箇所の意味の行（青の白抜き） */
const REASON_BOX = { borderLeft: "4px solid #c9a24a", background: "color-mix(in srgb, #c9a24a 13%, var(--rw-paper))" } as const;
const REASON_TITLE = { color: "color-mix(in srgb, #8a6a1f 85%, var(--rw-ink))" } as const;
const CUE_MARK = { textDecoration: "underline wavy var(--rw-primary)", textUnderlineOffset: "4px", color: "var(--rw-ink)" } as const;
// 青は少し沈めて落ち着いた紺に（2026-10-25 ユーザー指摘「青がやや明るい」）
const CUR_SENSE = { background: "color-mix(in srgb, var(--layer-1) 62%, var(--rw-ink))", color: "#fff" } as const;
const QUOTE_MARK = { background: "linear-gradient(transparent 58%, color-mix(in srgb, #facc15 55%, transparent) 58%)", fontWeight: 700 } as const;

/** 理由の文のうち、手がかりの語を含む「…」に蛍光ペンの下地を付ける（手がかりが無い・含まない「…」はそのまま） */
function markQuotes(summary: string, cues?: { text?: string }[]): ReactNode {
  const keys = (cues ?? []).map((c) => (c.text ?? "").trim()).filter(Boolean);
  if (!keys.length) return summary;
  return summary.split(/(「[^」]*」)/).map((part, i) =>
    /^「.*」$/.test(part) && keys.some((k) => part.includes(k)) ? <span key={i} style={QUOTE_MARK}>{part}</span> : part,
  );
}

// 助動詞・助詞の意味の札（見出しの横。それぞれの層の色＝助動詞の赤・助詞の緑を濃くした地に白字。2026-10-25 ユーザー指示）
const JODOSHI_MEANING = { background: "color-mix(in srgb, var(--layer-2) 88%, var(--rw-ink))", color: "#fff" } as const;
const JOSHI_MEANING = { background: "color-mix(in srgb, var(--layer-3) 82%, var(--rw-ink))", color: "#fff" } as const;
/** 見出し番号の札・帯のボタン（月の琴の試作と同じ見た目。2026-10-16 ユーザー指定） */
const BADGE = { background: "color-mix(in srgb, var(--layer-1) 14%, transparent)", color: "var(--layer-1)" } as const;
const BAR_BTN = "min-w-[40px] h-9 px-2 rounded-lg border border-rw-ink/20 bg-rw-paper text-rw-ink text-base leading-none active:scale-95";

export function WordCard({ token, analysis, anchor, pinned, touch, avoidBottom, onClose, onPrev, onNext }: WordCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  // 単語クイズへ飛ぶとき、クイズのあとでこの教材のこの語に戻れるようにする
  const location = useLocation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const preferAbove = touch;
  // 同じ語・同じ固定状態のまま枠だけ変わった（スクロールで語について動く）ときは、今の側に入るうちは側を変えない
  const placedKey = useRef<string | null>(null);
  // カード全体の高さの上限。置き場所のためにカードを縮めることはしない（2026-10-25 ユーザー指示「スクロールじゃない方がいい」）。
  // この上限を超えるごく長い中身だけがカードの中でスクロールする（月の琴の #tipbody と同じ）
  // 高さの上限は画面の64%・540px（2026-10-25 に月の琴の52%・440pxから広げた。見やすさ案Bで囲みが増え、中のスクロールを避けるため）
  const maxH = Math.min(window.innerHeight * 0.64, 540, window.innerHeight - avoidBottom - 16);

  const tag = token.grammarTag ?? { pos: "" };
  const vocabKey = resolveVocabKey(token.text, tag.baseForm, tag.pos, tag);
  const qids = vocabKey ? getQuizQidsForLemma(vocabKey, tag.pos) : [];
  const defaultGroup = qids.length ? Number(qids[0].split("-")[0]) : undefined;
  const decider = analysis?.decider;
  // 理由データが「単語帳の意味（…）とは別に、」で始まる語は、本文では単語帳の見出しと別の語（同形異語・接尾語など）。
  // 見出し番号と意味の一覧は出さず、単語カードへのリンクだけ残す（「単語帳の○○とは別」と分かるように）
  // この箇所の意味（教材の意味ラベル → 決め手の意味）と、単語帳の一覧の中でそれに当たる1つ。
  // 完全に一致する意味があればそれ（「生きている」で「いる」まで太字にしない）、無ければ部分一致の最初の1つ
  // 意味ラベルが「尊敬語」「謙譲語」「丁寧語」の類別だけのときは、理由データの具体的な意味を使う（類別では単語帳の意味に当たらない。2026-10-25）
  const meaning = (tag.meaning && !/^(尊敬語|謙譲語|丁寧語)$/.test(tag.meaning) ? tag.meaning : undefined) ?? decider?.meaning ?? tag.meaning;
  // 一覧の群は既定でクイズの最初の qid の群。この箇所の意味が同じ見出しの別の群（下二段の「たまふ」・名詞の「よし」など）にだけあればその群（2026-10-25）
  const { group, senses, curIdx } = vocabKey
    ? cardSenses(vocabKey, Number.isFinite(defaultGroup) ? defaultGroup : undefined, meaning)
    : { group: undefined, senses: [], curIdx: -1 };
  // 理由データが「単語帳の意味とは別に」で始まっていても、単語帳にその意味が（後から）入っていれば普通に扱う（2026-10-16 に 330 へ足した意味がある）
  const offList = !!decider?.summary && /^単語帳の意味/.test(decider.summary) && curIdx < 0;
  const enriched = enrichGrammarInfo(tag.pos, token.text, tag.baseForm, tag.conjugationType, tag.conjugationForm, tag.meaning);
  const isGrammar = tag.pos === "助動詞" || /助詞$/.test(tag.pos);
  // 助動詞・助詞はこの箇所の意味（不可能・完了・逆接・引用など）を見出しの横に出す。理由の文と食い違わないよう決め手の意味を先に使う
  const grammarMeaning = isGrammar ? grammarMeaningLabel(decider?.meaning || tag.meaning) : "";
  const grammarMeaningStyle = tag.pos === "助動詞" ? JODOSHI_MEANING : JOSHI_MEANING;
  // 固定したときの行き先。単語帳の語は単語の行き先、それ以外で参照単元のある語（助詞・助動詞・用言の活用など）は文法の行き先
  const showVocabLinks = !!vocabKey;
  const quizTopic = !showVocabLinks ? grammarQuizTopicOf(token.grammarRefId, tag.meaning) : null;
  const showGrammarLinks = !showVocabLinks && !!token.grammarRefId;

  // 位置：語の下に入れば下、入らなければ上。指で操作中は上を優先。横は点を中心に画面内へ収める
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 画面下のボタン列の実際の高さ（スマホでは2段になる）と、上の固定ヘッダの高さを測り、その間に収める
    const foot = document.querySelector("footer");
    const footH = foot ? Math.max(0, window.innerHeight - foot.getBoundingClientRect().top) : 0;
    const head = document.querySelector("header");
    const headH = head ? Math.max(0, head.getBoundingClientRect().bottom) : 0;
    const key = `${token.id}:${pinned}`;
    const following = placedKey.current === key;
    placedKey.current = key;
    if (bodyRef.current && !following) bodyRef.current.scrollTop = 0; // 語が変わったら中身は先頭から
    setPos((prev) =>
      placeCard({
        current: following ? prev?.below : undefined,
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
      className="fixed z-40 flex flex-col bg-rw-paper rounded-2xl border border-rw-ink/20 text-rw-ink" /* 月の琴と同じく即座に出す（浮き上がるアニメは付けない） */
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: "min(92vw, 360px)",
        margin: 0, // 親の space-y-* の margin-top が fixed にも効いて 12px 下にずれるのを防ぐ
        maxHeight: maxH,
        overflow: "visible", // 矢印は枠の外に出る。上限を超えたときのスクロールは中の bodyRef だけ（外側を overflow:auto にすると矢印が切れる）
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
        {grammarMeaning && <span className="text-[15px] font-black rounded-md px-2.5 py-0.5 tracking-wide" style={grammarMeaningStyle}>{grammarMeaning}</span>}
        {tag.baseForm && tag.baseForm !== token.text && <span className="text-xs text-rw-ink-soft">← {tag.baseForm}</span>}
        {vocabKey && Number.isFinite(group) && !offList ? (
          <span className="text-[13px] rounded-md px-2 py-0.5" style={BADGE}>No.{group}</span>
        ) : (
          tag.pos && <span className="text-[12px] rounded-md px-2 py-0.5 bg-rw-bg text-rw-ink-soft">{tag.pos}</span>
        )}
      </div>

      {/* 意味（単語）。教材の意味ラベル → 決め手の意味（単語の理由データ）の順。どちらも無ければこの行は出さず、下の一覧だけ（2026-10-25 ユーザー指示：意味は全部出して今回の意味を太字） */}
      {!isGrammar && meaning && (
        <p className="flex items-center gap-2.5 mt-1 leading-snug">
          <span className="shrink-0 text-[12px] font-black rounded-full px-2.5 py-0.5 bg-rw-ink text-rw-paper">意味</span>
          <span className="font-black text-[22px]">{meaning}</span>
        </p>
      )}

      {/* この箇所でその意味になる理由（analysis の決め手）。無ければ重要ポイント（hint） */}
      {/* 見やすさ案B（2026-10-25 ユーザー選択）：理由は金色の左線の囲みにまとめ、手がかりの語を含む「…」に蛍光ペンの下地 */}
      {decider?.summary ? (
        <p className="mt-1.5 rounded-r-lg px-3 py-1.5" style={REASON_BOX}>
          <span className="text-[11.5px] font-black tracking-widest mr-1.5" style={REASON_TITLE}>理由</span>
          {markQuotes(decider.summary, decider.cues)}
        </p>
      ) : token.hint ? (
        <p className="mt-1.5 rounded-r-lg px-3 py-1.5" style={REASON_BOX}>
          <span className="text-[11.5px] font-black tracking-widest mr-1.5" style={REASON_TITLE}>ポイント</span>
          {token.hint}
        </p>
      ) : null}

      {/* 固定したときだけ：理由の手がかりの注（本文では波線の語）。「もっと」をやめたので、従来の解説にあった注をここに出す */}
      {pinned && decider?.summary && !!decider.cues?.some((c) => c.note) && (
        <ul className="mt-1.5 space-y-0.5 text-[13px] text-rw-ink-soft">
          {decider.cues!.filter((c) => c.note).map((c, i) => (
            <li key={i}>
              {i === 0 && <span className="mr-1">手がかり：</span>}
              {i > 0 && <span className="mr-1 invisible">手がかり：</span>}
              {c.text && <span className="font-bold mr-1" style={CUE_MARK}>{c.text}</span>}
              （{c.note}）
            </li>
          ))}
        </ul>
      )}

      {/* 助詞・助動詞：品詞・接続・用法・活用形 */}
      {isGrammar && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-1 text-sm">
          <dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">品詞</dt>
          <dd>{tag.pos}{enriched.conjugationForm ? `（${enriched.conjugationForm}）` : ""}</dd>
          {enriched.connection && (<><dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">接続</dt><dd>{enriched.connection}</dd></>)}
          {tag.meaning && !grammarMeaning && (<><dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">用法</dt><dd>{tag.meaning}</dd></>)}
          {enriched.conjugationType && (<><dt className="text-[11px] font-bold text-rw-ink-soft pt-0.5">活用型</dt><dd>{enriched.conjugationType}</dd></>)}
        </dl>
      )}

      {/* 用言：品詞・活用型・活用形（単語帳の語は意味の一覧の前に1行で） */}
      {!isGrammar && (tag.conjugationType || tag.conjugationForm) && (
        <p className="text-xs text-rw-ink-soft mt-0.5">
          {tag.pos}{tag.conjugationType ? `・${tag.conjugationType}` : ""}{tag.conjugationForm ? `・${tag.conjugationForm}` : ""}
        </p>
      )}

      {/* 単語帳の意味の一覧は必ず全部出し、この箇所の意味を太くする（2026-10-25 ユーザー指示。1つしか無くても出す）。
          意味が決まっていない語・単語帳の見出しとは別の語（offList）は太字なしで一覧だけ */}
      {!isGrammar && senses.length > 0 && (
        <ol className="mt-1.5 text-[14px] leading-6">
          {senses.map((s, i) => {
            const cur = i === curIdx; // この箇所の意味は1つだけ。青の白抜きの行（見やすさ案B）
            return (
              <li key={s.qid} className={`flex gap-2 rounded-md px-2.5 ${cur ? "font-black" : "text-rw-ink-soft"}`} style={cur ? CUR_SENSE : undefined}>
                <span className="w-4 shrink-0 text-right">{i + 1}</span>
                <span>{(s.senseNorm ?? s.sense ?? "").replace(/〔|〕/g, "")}</span>
              </li>
            );
          })}
        </ol>
      )}

      {/* 品詞も意味もポイントも無い語（名詞の多く・人名など）：空のカードにせず、まだ解説が無いことを書く */}
      {!isGrammar && !tag.pos && !meaning && !decider?.summary && !token.hint && senses.length === 0 && (
        <p className="text-[13px] text-rw-ink-soft mt-1">この語の解説はまだありません</p>
      )}

      {/* 固定したときだけ：行き先（単語帳の語＝単語カード・単語クイズ、文法の語＝文法解説・文法のクイズ） */}
      {pinned ? (
        (showVocabLinks || showGrammarLinks) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2 border-t border-rw-ink/15 text-sm font-bold" style={{ color: "var(--rw-primary)" }}>
            {showVocabLinks && (
              <Link to={`/word/${encodeURIComponent(vocabKey!)}`}>
                {offList ? `単語帳の「${vocabKey}」を見る（この箇所とは別の意味）` : `→ 単語カード「${vocabKey}」`}
              </Link>
            )}
            {showVocabLinks && !offList && qids.length > 0 && (
              <Link to={quizUrlWithReturn(qids, makeReturnTo(location.pathname, location.search, token.id))}>→ 単語クイズ</Link>
            )}
            {showGrammarLinks && <Link to={`/read/reference/${token.grammarRefId}`}>→ 文法解説</Link>}
            {quizTopic && <Link to={`/read/grammar/${quizTopic}`}>→ 文法のクイズ</Link>}
          </div>
        )
      ) : (
        // 指を当てている間は出さない（月の琴にこの行は無い。「クリック」は指の操作に合わない）
        !touch && <p className="text-[11px] text-rw-ink-soft mt-1">クリックで固定</p>
      )}
      </div>
    </div>
  );
}
