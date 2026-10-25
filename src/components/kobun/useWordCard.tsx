/**
 * 浮かぶ解説カード（WordCard）の操作をまとめたフック。教材画面（TextReader）が本文全体を包む要素に bind を付け、
 * element を描く。文をまたいでなぞれるよう、状態は文の部品（TokenizedText）ではなくここに持つ。
 *
 * PC：語にマウスを重ねるだけで出る。クリックで固定、外をクリックか Esc で閉じる。
 * スマホ：語に指を当てている間に出る。横になぞると指の下の語に切り替わり、離すと消える（横書きなので横がなぞり）。
 *         動かさずに離した（タップ）ときは出したままにし、同じ語をもう一度タップすると閉じる。縦はページのスクロール。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent, type TouchEvent } from "react";
import type { Token, TextAnalysis } from "@/lib/kobun/types";
import { resolveVocabKey } from "@/lib/vocabAlias";
import { recordHintOpen } from "@/lib/kobun/progress";
import { touchMode, tapOutcome, type TouchMode } from "@/lib/kobun/wordCardLayout";
import { WordCard, type WordCardAnchor } from "@/components/kobun/WordCard";

export interface WordCardTokenInfo {
  token: Token;
  sentenceId: string;
}

interface Options {
  enabled: boolean;
  textId: string;
  /** 教材の全トークン（id → トークンと文） */
  tokens: Map<string, WordCardTokenInfo>;
  analysis: TextAnalysis | null;
  /** 画面下の帯などの高さ（カードを重ねない） */
  avoidBottom: number;
  /** カードを固定した（その語を見たと記録する。以前は「もっと」で開いたときだけ記録していた） */
  onPin?: (tokenId: string) => void;
  /** カードを出した文（画面下の帯に訳を出す） */
  onFocusSentence?: (sentenceId: string) => void;
}

interface CardState {
  id: string;
  anchor: WordCardAnchor;
  pinned: boolean;
  /** 指を当てている間（まだ固定していない） */
  held: boolean;
  /** 指（タッチ）で出した。固定したあとも上を優先し続ける（月の琴と同じ。held だけで判定すると、タップで固定した瞬間に下へ飛ぶ） */
  touch: boolean;
}

/** 品詞の無い句読点・かぎ括弧（教材データでは品詞が空のトークンとして入っていることがある）。カードを出さない */
const PUNCT = /^[\s、。，．・「」『』（）()〈〉《》【】〔〕！？!?…―—]+$/;

export function useWordCard(o: Options) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<CardState | null>(null);
  const touch = useRef<{ x: number; y: number; mode: TouchMode; id: string | null; pinnedBefore: string | null } | null>(null);
  const suppressClick = useRef(false);
  const ignoreScrollUntil = useRef(0); // ‹ › で語へスクロールした直後は、スクロールで閉じない
  const cardRef = useRef(card);
  cardRef.current = card;

  // カードは本文の全部の語に出す（2026-10-25 ユーザー指示「全部の語をカードに」。月の琴も全部の語に出す）。
  // 外すのは記号と、品詞の無い句読点・かぎ括弧だけ。単語帳（330）に紐づく語は vocabIds で別に持ち、下線と見出し番号に使う
  const { vocabIds, cardIds } = useMemo(() => {
    const vocab = new Set<string>(), all = new Set<string>();
    for (const [id, { token: t }] of o.tokens) {
      const g = t.grammarTag ?? { pos: "" };
      const p = g.pos ?? "";
      if (p === "記号" || !t.text.trim() || PUNCT.test(t.text)) continue;
      all.add(id);
      // 品詞が空の語（名詞の多くは品詞分解に品詞が入っていない）も単語帳の対象にする
      if (p !== "助動詞" && !/助詞$/.test(p) && resolveVocabKey(t.text, g.baseForm, p, g)) vocab.add(id);
    }
    return { vocabIds: vocab, cardIds: all };
  }, [o.tokens]);
  const explainable = useCallback((id: string) => cardIds.has(id), [cardIds]);
  const isVocab = useCallback((id: string) => vocabIds.has(id), [vocabIds]);
  // ‹ › で移る順（本文の順に並んだ全部の語。月の琴の WORDS と同じ）
  const cardOrder = useMemo(() => [...o.tokens.keys()].filter((id) => cardIds.has(id)), [o.tokens, cardIds]);

  /** 本文の中の、点の下にある語（重なっているカードは透かして見る） */
  const tokenAt = useCallback((x: number, y: number): { id: string; el: HTMLElement } | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const span = (el as HTMLElement).closest?.("[data-token-id]") as HTMLElement | null;
      if (span && rootRef.current?.contains(span)) return { id: span.dataset.tokenId!, el: span };
    }
    return null;
  }, []);

  const show = useCallback(
    (id: string, el: HTMLElement, pt: { x: number; y: number } | null, opts: { pinned: boolean; held: boolean; touch: boolean }) => {
      if (!explainable(id)) return;
      setCard({ id, anchor: { rect: el.getBoundingClientRect(), x: pt?.x, y: pt?.y }, ...opts });
      const info = o.tokens.get(id);
      if (info) o.onFocusSentence?.(info.sentenceId);
    },
    [explainable, o],
  );
  const close = useCallback(() => setCard(null), []);

  // 固定したときだけ「解説を開いた」として記録する（重ねただけでは数えない）
  useEffect(() => {
    if (!card?.pinned) return;
    const t = o.tokens.get(card.id)?.token;
    if (t && o.textId) recordHintOpen(o.textId, t.text, { id: t.id, base: t.grammarTag?.baseForm, pos: t.grammarTag?.pos, ref: t.grammarRefId });
    if (t) o.onPin?.(t.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.pinned, card?.id]);

  // 固定中：外をクリック（タップ）か Esc で閉じる
  useEffect(() => {
    if (!card?.pinned) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-word-card]")) return;
      // 指で本文に触れたときはここでは閉じない：スクロールなら固定カードは語について動き、動かさずに離した（タップ）ときだけ onTouchEnd が閉じる（月の琴と同じ）
      if (e.pointerType === "touch" && rootRef.current?.contains(t)) return;
      if (rootRef.current?.contains(t) && t.closest("[data-token-id]")) return; // 語の上はクリック・タップ側で扱う
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [card?.pinned, close]);

  // 長押しで文字選択・コピーのメニューが出ないようにする（2026-10-16 ユーザー指示：意図しない操作）。
  // CSS の user-select / touch-callout に加え、選択の開始と長押しメニューを止める
  useEffect(() => {
    const el = rootRef.current;
    if (!o.enabled || !el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("selectstart", stop);
    el.addEventListener("contextmenu", stop);
    return () => { el.removeEventListener("selectstart", stop); el.removeEventListener("contextmenu", stop); };
  }, [o.enabled]);

  // 教材が切り替わったら閉じる
  useEffect(() => { setCard(null); }, [o.textId, o.enabled]);
  // ページがスクロールしたら：固定中のカードは語について動き、語が本文の見える範囲（ヘッダと下の帯の間）から出たら閉じる（月の琴と同じ）。
  // 重ねているだけ・指を当てているだけのカードは閉じる
  const open = !!card;
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const onScroll = () => {
      if (performance.now() <= ignoreScrollUntil.current) return;
      const cur = cardRef.current;
      if (!cur) return;
      if (!cur.pinned) { setCard(null); return; }
      if (raf) cancelAnimationFrame(raf); // 最後のスクロールの位置で置き直す（慣性スクロールの途中で止まらないように）
      raf = requestAnimationFrame(() => {
        raf = 0;
        const c = cardRef.current;
        if (!c?.pinned) return;
        const el = rootRef.current?.querySelector(`[data-token-id="${c.id}"]`) as HTMLElement | null;
        if (!el) { setCard(null); return; }
        const r = el.getBoundingClientRect();
        const head = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        const foot = document.querySelector("footer")?.getBoundingClientRect().top ?? window.innerHeight;
        if (r.bottom < head || r.top > foot) { setCard(null); return; }
        setCard({ ...c, anchor: { rect: r } });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [open]);
  /** 従来の詳しい解説（GrammarPopover）が開いている間は、重ねても出さない */
  const popoverOpen = () => !!document.querySelector("[data-grammar-popover]");

  // ---- マウス（ペン）：重ねるだけで出す。固定中は動かさない ----
  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    if (!o.enabled || e.pointerType === "touch" || cardRef.current?.pinned || popoverOpen()) return;
    const span = (e.target as HTMLElement).closest("[data-token-id]") as HTMLElement | null;
    if (span) show(span.dataset.tokenId!, span, { x: e.clientX, y: e.clientY }, { pinned: false, held: false, touch: false });
  };
  const onPointerOut = (e: PointerEvent<HTMLDivElement>) => {
    if (!o.enabled || e.pointerType === "touch" || cardRef.current?.pinned) return;
    const span = (e.target as HTMLElement).closest("[data-token-id]");
    if (span && !span.contains(e.relatedTarget as Node | null)) close();
  };
  // ---- クリック（マウス）：固定。固定中の同じ語なら解除 ----
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!o.enabled || suppressClick.current || popoverOpen()) return; // タッチ操作の直後に来る click と、従来の解説が開いている間は無視
    const span = (e.target as HTMLElement).closest("[data-token-id]") as HTMLElement | null;
    if (!span) return;
    const id = span.dataset.tokenId!;
    if (!explainable(id)) { close(); return; } // 句読点など
    if (cardRef.current?.pinned && cardRef.current.id === id) { close(); return; }
    show(id, span, { x: e.clientX, y: e.clientY }, { pinned: true, held: false, touch: false });
  };
  // ---- タッチ ----
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!o.enabled || e.touches.length !== 1) { touch.current = null; return; }
    const t = e.touches[0];
    const hit = tokenAt(t.clientX, t.clientY);
    touch.current = { x: t.clientX, y: t.clientY, mode: null, id: hit?.id ?? null, pinnedBefore: cardRef.current?.pinned ? cardRef.current.id : null };
    if (hit) show(hit.id, hit.el, { x: t.clientX, y: t.clientY }, { pinned: false, held: true, touch: true });
  };
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const tc = touch.current;
    if (!o.enabled || !tc || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!tc.mode) {
      tc.mode = touchMode(t.clientX - tc.x, t.clientY - tc.y);
      if (tc.mode === "pan") setCard((c) => (c && !c.pinned ? null : c)); // スクロール中は出さない（固定中は残す）
    }
    if (tc.mode !== "scrub") return;
    const hit = tokenAt(t.clientX, t.clientY);
    if (hit && hit.id !== cardRef.current?.id) show(hit.id, hit.el, { x: t.clientX, y: t.clientY }, { pinned: false, held: true, touch: true });
  };
  const onTouchEnd = () => {
    const tc = touch.current;
    touch.current = null;
    if (!o.enabled || !tc) return;
    // 語の操作のあとに来る click は無視する（カードの出ない句読点などのタップだけ click に通す）
    const vocabTap = tc.mode === null && !!tc.id && explainable(tc.id);
    if (tc.mode === "scrub" || vocabTap) { suppressClick.current = true; setTimeout(() => (suppressClick.current = false), 400); }
    if (tc.mode === "scrub") { setCard((c) => (c && !c.pinned ? null : c)); return; }
    if (tc.mode === "pan") return;
    if (tc.id && !explainable(tc.id)) { close(); return; } // 句読点など：カードは閉じる
    if (tapOutcome(tc.id, tc.pinnedBefore) === "close") { close(); return; }
    setCard((c) => (c && c.id === tc.id ? { ...c, pinned: true, held: false } : c));
  };
  // 固定中の ‹ ›：前・次の語へ。画面の外なら中央までスクロールしてから出す
  const step = (d: number) => {
    const cur = cardRef.current;
    if (!cur) return;
    const i = cardOrder.indexOf(cur.id) + d;
    if (i < 0 || i >= cardOrder.length) return;
    const id = cardOrder[i];
    const el = rootRef.current?.querySelector(`[data-token-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight - o.avoidBottom - 20) {
      ignoreScrollUntil.current = performance.now() + 400;
      el.scrollIntoView({ block: "center" });
    }
    requestAnimationFrame(() => {
      setCard({ id, anchor: { rect: el.getBoundingClientRect() }, pinned: true, held: false, touch: cur.touch });
      const info = o.tokens.get(id);
      if (info) o.onFocusSentence?.(info.sentenceId);
    });
  };
  const onTouchCancel = () => { touch.current = null; setCard((c) => (c && !c.pinned ? null : c)); };

  const style: CSSProperties | undefined = o.enabled
    ? { touchAction: "pan-y", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }
    : undefined;
  const bind = { onPointerOver, onPointerOut, onClick, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, style };

  const info = card ? o.tokens.get(card.id) : undefined;
  const cardDecider = card ? o.analysis?.tokenAnalyses.find((a) => a.tokenId === card.id)?.decider : undefined;
  // 決め手の手がかり（cues の text）に当たる語：同じ文の語を順につないだ文字列の中で探し、重なる語に下線を引く
  const cueIds = useMemo(() => {
    const s = new Set<string>();
    if (!info || !cardDecider?.cues?.length) return s;
    const sentTokens = [...o.tokens.values()].filter((x) => x.sentenceId === info.sentenceId).map((x) => x.token);
    let joined = "";
    const spans: { id: string; from: number; to: number }[] = [];
    for (const t of sentTokens) { spans.push({ id: t.id, from: joined.length, to: joined.length + t.text.length }); joined += t.text; }
    for (const c of cardDecider.cues) {
      if (!c.text) continue;
      const at = joined.indexOf(c.text);
      if (at < 0 || joined.indexOf(c.text, at + 1) >= 0) continue; // 見つからない・2回以上出る手がかりは引かない
      for (const sp of spans) if (sp.from < at + c.text.length && sp.to > at && sp.id !== card!.id) s.add(sp.id);
    }
    return s;
  }, [info, cardDecider, o.tokens, card]);
  const element =
    o.enabled && card && info ? (
      <WordCard
        token={info.token}
        analysis={o.analysis?.tokenAnalyses.find((a) => a.tokenId === card.id) ?? null /* 決め手（cueIds と同じもの） */}
        anchor={card.anchor}
        pinned={card.pinned}
        touch={card.touch}
        avoidBottom={o.avoidBottom}
        onClose={close}
        onPrev={cardOrder.indexOf(card.id) > 0 ? () => step(-1) : undefined}
        onNext={cardOrder.indexOf(card.id) < cardOrder.length - 1 ? () => step(1) : undefined}
      />
    ) : null;

  return { rootRef, bind, element, activeId: card?.id ?? null, close, cueIds, isVocab, isCard: explainable };
}
