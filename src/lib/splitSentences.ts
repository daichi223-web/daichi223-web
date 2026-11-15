// 文を一文ずつに分ける（2026-11-15 に readingTest.ts から切り出した。文法道場のレッスンでも使う。
// readingTest.ts は単語データを抱えているので、そこから import すると道場の画面に単語データまで載るため）。

/**
 * 解説を一文ずつに分ける。「。」「！」「？」で切るが、「」『』（）〈〉【】の中では切らない。
 * 閉じかっこが続く「…た。」」は、かっこまで含めて一文にする。空の文は捨てる。
 */
export function splitSentences(text: string): string[] {
  const OPEN = "「『（(〈【";
  const CLOSE = "」』）)〉】";
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    cur += ch;
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && "。！？".includes(ch)) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
