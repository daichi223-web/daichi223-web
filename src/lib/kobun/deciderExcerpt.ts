/**
 * 「意味の決め手」に出す本文を、判定する語（【】）と手がかり（cues）を含む範囲だけに切り詰める（2026-10-16）。
 * 文全体が意味の確定に要るわけではないので、長い文は前後を「…」で省く。
 * - 範囲 = 【】と、本文に1回だけ出る手がかりの位置を全部含む最小の区間
 * - その外側へ少しだけ広げ、読点・句点・かぎかっこで切れるならそこで切る
 */
export function excerptForDecider(
  marked: string,
  cueTexts: string[],
  opts: { maxLen?: number; pad?: number } = {},
): string {
  const maxLen = opts.maxLen ?? 48;
  const pad = opts.pad ?? 10;
  if (marked.length <= maxLen) return marked;

  const plain = marked.replace(/[【】]/g, "");
  const ts = marked.indexOf("【");
  const te = marked.indexOf("】");
  // 【】が無いときは手がかりだけで決める
  const spans: [number, number][] = [];
  if (ts >= 0 && te > ts) spans.push([ts, te + 1]);
  for (const c of cueTexts) {
    if (!c) continue;
    const at = marked.indexOf(c);
    if (at >= 0 && marked.indexOf(c, at + 1) < 0) spans.push([at, at + c.length]);
  }
  if (!spans.length) return plain.length <= maxLen ? plain : marked;

  let from = Math.min(...spans.map((s) => s[0]));
  let to = Math.max(...spans.map((s) => s[1]));
  // 【】の途中で切らない
  const fixBracket = (i: number, dir: -1 | 1) => {
    if (ts >= 0 && te > ts && i > ts && i <= te) return dir < 0 ? ts : te + 1;
    return i;
  };
  // 外へ広げる：pad 字以内に区切りがあればそこまで、無ければ pad 字
  const BREAK = /[、。「」『』，．]/;
  let a = Math.max(0, from - pad);
  for (let i = from - 1; i >= Math.max(0, from - pad); i--) if (BREAK.test(marked[i])) { a = i + 1; break; }
  let b = Math.min(marked.length, to + pad);
  for (let i = to; i < Math.min(marked.length, to + pad); i++) if (BREAK.test(marked[i])) { b = i + 1; break; }
  a = fixBracket(a, -1);
  b = fixBracket(b, 1);
  from = a;
  to = b;

  const body = marked.slice(from, to);
  return `${from > 0 ? "…" : ""}${body}${to < marked.length ? "…" : ""}`;
}
