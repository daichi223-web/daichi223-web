/**
 * 逐語訳（public/chikugo/<教材ID>.json）の型と表示用の小さな関数（2026-10-25〜）。
 * 各文は [原文の区切り, その訳] の並び。訳の（ ）は原文に無い補った語。検査 = scripts/check-chikugo.mjs
 * 2026-10-27〜 区切りは単語ごと（助詞・助動詞・補助動詞は1語で。訳さない語は「―」。掛詞も1語ずつで、二つの意味は「／」で並べる）。
 * 3つ目の数は「訳を後ろへ送る区切りの数」。疑問・反語の「や・か」は文中にあるが訳は結びの後ろに出す（2026-10-27 ユーザー指示）。
 * 負の数は前へ送る（その数だけ前の区切りの手前に出す）。強意の「ぬ・つ」＋推量の「きっと」を動詞の前に出すのに使う
 */
export type ChikugoPair = [string, string] | [string, string, number];
export type Chikugo = { textId: string; title?: string; note?: string; sentences: Record<string, ChikugoPair[]> };

/**
 * 訳を表示する順に並べる。3つ目の数のある区切りは、その数だけ後ろの区切りの訳の後ろへ送る（負なら前の区切りの手前へ）。
 * 送った先の訳が句読点で終わるときは、句読点を送った訳の後ろへ回す（「あるか、」にする）
 */
export function displayTranslations(pairs: ChikugoPair[]): string[] {
  const after = new Map<number, string[]>(), before = new Map<number, string[]>();
  pairs.forEach((p, i) => {
    if (!p[2]) return;
    const m = p[2] > 0 ? after : before;
    m.set(i + p[2], [...(m.get(i + p[2]) || []), p[1]]);
  });
  const out: string[] = [];
  pairs.forEach((p, i) => {
    if (p[2]) return;
    out.push(...(before.get(i) || []));
    const moved = after.get(i);
    if (!moved) { out.push(p[1]); return; }
    const [, body, punct] = p[1].match(/^([\s\S]*?)([、。，．」』！？!?]*)$/)!;
    out.push(body, ...moved.slice(0, -1), moved[moved.length - 1] + punct);
  });
  return out;
}

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
