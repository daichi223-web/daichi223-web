/**
 * 浮かぶ解説カード（WordCard）に出す単語帳（330）の意味の一覧と、この箇所の意味に当たる1つを決める。
 * - 同じ意味の qid（「活用違い」）だけを1つにまとめる。かっこの中身が違う意味（のたまふ／のたまはす、（人から）思われる など）は別の意味として残す
 * - 既定はクイズの最初の qid の群。この箇所の意味が同じ見出しの別の群（下二段の「たまふ」、名詞の「よし」など）にだけあるときは、その群を出す
 */
import bundledKobunQ from "@/data/kobunQ.v2.slim.json";

export type QEntry = { qid: string; lemma: string; group?: number; meaning_idx?: number; senseNorm?: string; sense?: string };

let byLemma: Map<string, QEntry[]> | null = null;
function entries(lemma: string): QEntry[] {
  if (!byLemma) {
    byLemma = new Map();
    for (const q of bundledKobunQ as QEntry[]) {
      if (!q.lemma) continue;
      const arr = byLemma.get(q.lemma) ?? [];
      arr.push(q);
      byLemma.set(q.lemma, arr);
    }
  }
  return byLemma.get(lemma) ?? [];
}

const text = (q: QEntry) => q.senseNorm ?? q.sense ?? "";

/** 同じ意味をまとめる鍵。「活用違い」の印だけを外す（ほかのかっこは意味の区別なので残す） */
export function senseKey(s: string): string {
  return s.replace(/（活用違い）|\(活用違い\)/g, "").replace(/・活用違い/g, "").trim();
}

/** 見出しの意味の一覧（単語帳の並び順、同じ意味は1つ）。group を渡すとその群だけ */
export function sensesOf(lemma: string, group?: number): QEntry[] {
  const all = entries(lemma).filter((q) => group === undefined || q.group === group);
  all.sort((a, b) => (a.meaning_idx ?? 0) - (b.meaning_idx ?? 0));
  const seen = new Set<string>();
  return all.filter((q) => {
    const k = senseKey(text(q));
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 見出しの群（単語帳の並び順） */
export function groupsOf(lemma: string): number[] {
  const gs: number[] = [];
  for (const q of [...entries(lemma)].sort((a, b) => (a.meaning_idx ?? 0) - (b.meaning_idx ?? 0)))
    if (q.group !== undefined && !gs.includes(q.group)) gs.push(q.group);
  return gs;
}

/** 意味ラベルと単語帳の意味が同じものを指しているか（表記の揺れを少し吸収） */
export function sameSense(meaning: string | undefined, norm: string | undefined): boolean {
  if (!meaning || !norm) return false;
  const a = meaning.replace(/[〜～()（）・\s]/g, "");
  const b = norm.replace(/[〜～()（）・\s]/g, "");
  return a === b || a.includes(b) || b.includes(a);
}

const exactKey = (x?: string) => (x ?? "").replace(/〔|〕|[〜～()（）\s]/g, "");
const exactIndex = (ss: QEntry[], meaning: string) => ss.findIndex((x) => exactKey(text(x)) === exactKey(meaning));
const partialIndex = (ss: QEntry[], meaning: string) => ss.findIndex((x) => sameSense(meaning, text(x)));

/**
 * カードに出す一覧と、この箇所の意味に当たる1つ（curIdx、無ければ -1）。
 * 完全に一致する意味を先に探し（「生きている」で「いる」まで太字にしない）、無ければ部分一致の最初の1つ。
 * 既定の群に無いときだけ、同じ見出しのほかの群を見る。
 */
export function cardSenses(lemma: string, defaultGroup: number | undefined, meaning: string | undefined): { group: number | undefined; senses: QEntry[]; curIdx: number } {
  const base = sensesOf(lemma, defaultGroup);
  if (!meaning) return { group: defaultGroup, senses: base, curIdx: -1 };
  const order = defaultGroup === undefined ? [] : [defaultGroup, ...groupsOf(lemma).filter((g) => g !== defaultGroup)];
  const tries: [number | undefined, QEntry[]][] = defaultGroup === undefined ? [[undefined, base]] : order.map((g) => [g, g === defaultGroup ? base : sensesOf(lemma, g)]);
  for (const find of [exactIndex, partialIndex]) {
    for (const [g, ss] of tries) {
      const i = find(ss, meaning);
      if (i >= 0) return { group: g, senses: ss, curIdx: i };
    }
  }
  return { group: defaultGroup, senses: base, curIdx: -1 };
}
