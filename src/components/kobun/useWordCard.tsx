/**
 * 浮かぶ解説カード（WordCard）の操作をまとめたフック。教材画面（TextReader）が本文全体を包む要素に bind を付け、
 * element を描く。文をまたいでなぞれるよう、状態は文の部品（TokenizedText）ではなくここに持つ。
 *
 * PC：語にマウスを重ねるだけで出る。クリックで固定、外をクリックか Esc で閉じる。
 * スマホ：語に指を当てている間に出る。横になぞると指の下の語に切り替わり、離すと消える（横書きなので横がなぞり）。
 *         動かさずに離した（タップ）ときは出したままにし、同じ語をもう一度タップすると閉じる。縦はページのスクロール。
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent, type TouchEvent } from "react";
import type { Token, TextAnalysis } from "@/lib/kobun/types";
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
  /** 「もっと」：従来の詳しい解説を開く */
  onMore: (tokenId: string) => void;
  /** カードを出した文（画面下の帯に訳を出す） */
  onFocusSentence?: (sentenceId: string) => void;
}

interface CardState {
  id: string;
  anchor: WordCardAnchor;
  pinned: boolean;
  held: boolean;
}

export function useWordCard(o: Options) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<CardState | null>(null);
  const touch = useRef<{ x: number; y: number; mode: TouchMode; id: string | null; pinnedBefore: string | null } | null>(null);
  const suppressClick = useRef(false);
  const cardRef = useRef(card);
  cardRef.current = card;

  const explainable = useCallback(
    (id: string) => {
      const t = o.tokens.get(id)?.token;
      return !!t && !!t.grammarTag?.pos && t.grammarTag.pos !== "記号" && !!t.text.trim();
    },
    [o.tokens],
  );

  /** 本文の中の、点の下にある語（重なっているカードは透かして見る） */
  const tokenAt = useCallback((x: number, y: number): { id: string; el: HTMLElement } | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const span = (el as HTMLElement).closest?.("[data-token-id]") as HTMLElement | null;
      if (span && rootRef.current?.contains(span)) return { id: span.dataset.tokenId!, el: span };
    }
    return null;
  }, []);

  const show = useCallback(
    (id: string, el: HTMLElement, pt: { x: number; y: number } | null, opts: { pinned: boolean; held: boolean }) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.pinned, card?.id]);

  // 固定中：外をクリック（タップ）か Esc で閉じる
  useEffect(() => {
    if (!card?.pinned) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-word-card]")) return;
      if (rootRef.current?.contains(t) && t.closest("[data-token-id]")) return; // 語の上はクリック・タップ側で扱う
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [card?.pinned, close]);

  // 教材が切り替わったら閉じる
  useEffect(() => { setCard(null); }, [o.textId, o.enabled]);
  // ページがスクロールしたら閉じる（カードは画面に固定なので、語から離れてしまう）
  useEffect(() => {
    if (!card) return;
    const onScroll = () => setCard(null);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [card]);
  /** 従来の詳しい解説（GrammarPopover）が開いている間と、「もっと」で開く直前は、重ねても出さない */
  const hoverBlockUntil = useRef(0);
  const popoverOpen = () => performance.now() < hoverBlockUntil.current || !!document.querySelector("[data-grammar-popover]");

  // ---- マウス（ペン）：重ねるだけで出す。固定中は動かさない ----
  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    if (!o.enabled || e.pointerType === "touch" || cardRef.current?.pinned || popoverOpen()) return;
    const span = (e.target as HTMLElement).closest("[data-token-id]") as HTMLElement | null;
    if (span) show(span.dataset.tokenId!, span, { x: e.clientX, y: e.clientY }, { pinned: false, held: false });
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
    if (cardRef.current?.pinned && cardRef.current.id === id) { close(); return; }
    show(id, span, { x: e.clientX, y: e.clientY }, { pinned: true, held: false });
  };
  // ---- タッチ ----
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!o.enabled || e.touches.length !== 1) { touch.current = null; return; }
    const t = e.touches[0];
    const hit = tokenAt(t.clientX, t.clientY);
    touch.current = { x: t.clientX, y: t.clientY, mode: null, id: hit?.id ?? null, pinnedBefore: cardRef.current?.pinned ? cardRef.current.id : null };
    if (hit) show(hit.id, hit.el, { x: t.clientX, y: t.clientY }, { pinned: false, held: true });
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
    if (hit && hit.id !== cardRef.current?.id) show(hit.id, hit.el, { x: t.clientX, y: t.clientY }, { pinned: false, held: true });
  };
  const onTouchEnd = () => {
    const tc = touch.current;
    touch.current = null;
    if (!o.enabled || !tc) return;
    if (tc.mode !== "pan") { suppressClick.current = true; setTimeout(() => (suppressClick.current = false), 400); }
    if (tc.mode === "scrub") { setCard((c) => (c && !c.pinned ? null : c)); return; }
    if (tc.mode === "pan") return;
    if (tapOutcome(tc.id, tc.pinnedBefore) === "close") { close(); return; }
    setCard((c) => (c && c.id === tc.id ? { ...c, pinned: true, held: false } : c));
  };
  const onTouchCancel = () => { touch.current = null; setCard((c) => (c && !c.pinned ? null : c)); };

  const style: CSSProperties | undefined = o.enabled
    ? { touchAction: "pan-y", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }
    : undefined;
  const bind = { onPointerOver, onPointerOut, onClick, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, style };

  const info = card ? o.tokens.get(card.id) : undefined;
  const element =
    o.enabled && card && info ? (
      <WordCard
        token={info.token}
        analysis={o.analysis?.tokenAnalyses.find((a) => a.tokenId === card.id) ?? null}
        anchor={card.anchor}
        pinned={card.pinned}
        preferAbove={card.held}
        avoidBottom={o.avoidBottom}
        onClose={close}
        onMore={() => { hoverBlockUntil.current = performance.now() + 600; close(); o.onMore(card.id); }}
      />
    ) : null;

  return { rootRef, bind, element, activeId: card?.id ?? null, close };
}
