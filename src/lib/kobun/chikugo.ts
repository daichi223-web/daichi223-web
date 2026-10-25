/**
 * 逐語訳（public/chikugo/<教材ID>.json）の型と表示用の小さな関数（2026-10-25〜）。
 * 各文は [原文の区切り, その訳] の並び。訳の（ ）は原文に無い補った語。検査 = scripts/check-chikugo.mjs
 */
export type ChikugoPair = [string, string];
export type Chikugo = { textId: string; title?: string; note?: string; sentences: Record<string, ChikugoPair[]> };

/** 訳を「補った語（（ ）の中）」とそれ以外に分ける。（ ）はそのまま残す */
export function splitHokan(t: string): { text: string; hokan: boolean }[] {
  const out: { text: string; hokan: boolean }[] = [];
  let buf = "", depth = 0;
  const push = (hokan: boolean) => { if (buf) { out.push({ text: buf, hokan }); buf = ""; } };
  for (const ch of t) {
    if (ch === "（") { if (depth === 0) push(false); depth++; buf += ch; continue; }
    if (ch === "）" && depth > 0) { buf += ch; depth--; if (depth === 0) push(true); continue; }
    buf += ch;
  }
  push(depth > 0);
  return out;
}
