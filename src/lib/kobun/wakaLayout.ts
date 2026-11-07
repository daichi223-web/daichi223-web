// 教材画面での「和歌の並べ方」（2026-11-08 ユーザー指示「和歌のところが見づらい」。検討 = docs/waka-display-design.md）
//
// texts-v3 の文は教科書の行の切れ目で区切られていて、和歌の教材では
//   ・詞書＋〈部立〉＋全角スペースの連続＋歌人名 が1文
//   ・詞書が語の途中で2〜3文に割れている
//   ・歌集名だけの文、長歌の1行だけの文
// が混ざる。データと文番号は変えずに、和歌の構成ファイル public/waka/<教材ID>.json（文IDを指す並行層）で
// 「歌集名／詞書＋歌人名／歌（句の切れ目つき）」のかたまりに組み直す。
// 散文の教材でも、末尾の「」　　　（道長上）」のような右寄せの出典・作者は同じ形（スペース連続）で入っているので、
// 構成ファイルが無い教材でもそこだけは分けて右寄せにする。

import type { Sentence, Token } from "./types";

/** 全角（半角混じり可）スペースの連続＝教科書の右寄せの名残。トークンの前後に文字が付くことがある（「〈恋〉　　　」「　　　松尾芭蕉」） */
export const SPACE_RUN = /[　 ]{2,}/;

// ---- 構成ファイルの型（public/waka/<textId>.json） ----
export interface WakaLine {
  sentenceId: string;
  /** 句の切れ目（originalText の文字位置）。短歌は4つ・発句は2つ。長歌・歌謡の行は全角スペースで切れているので無い */
  ku?: number[];
}
export interface WakaPoemBlock {
  type: "poem";
  form: "tanka" | "choka" | "hokku" | "song";
  /** 部立（春・恋・羇旅…） */
  category?: string;
  /** 詞書の文ID（割れた詞書は複数） */
  kotobagaki?: string[];
  author?: string;
  /** 歌人名が付いている文（スペース連続の後ろが歌人名） */
  authorSentenceId?: string;
  lines: WakaLine[];
  /** 長歌の反歌 */
  hanka?: WakaLine[];
}
export interface WakaCollectionBlock {
  type: "collection";
  title: string;
  /** 本文にその行があれば文ID。無ければ空（梁塵秘抄・閑吟集・万葉集） */
  sentenceIds: string[];
}
export type WakaBlock = WakaPoemBlock | WakaCollectionBlock;
export interface WakaLayout {
  textId: string;
  title?: string;
  note?: string;
  blocks: WakaBlock[];
}

// ---- 画面で描く単位 ----
/** 文の全部または一部（右寄せの名前を除いた頭、または名前だけ）。tokens は文字を切った写しのことがある（id は元のまま） */
export interface Piece {
  sentence: Sentence;
  tokens: Token[];
  /** 句の切れ目の印（トークンID → その語の後ろに 句の空き／上の句と下の句の行替え） */
  kuMarks?: Map<string, "space" | "break">;
}
export type RenderBlock =
  | { kind: "collection"; title: string; pieces: Piece[] }
  | {
      kind: "poem";
      form: WakaPoemBlock["form"];
      category?: string;
      kotobagaki: Piece[];
      author: Piece | null;
      lines: Piece[];
      hanka: Piece[];
    }
  | { kind: "prose"; piece: Piece; tail: Piece | null };

/** 文の中のスペース連続で「頭」と「右寄せの尾」に分ける。スペースがトークンの中にあれば、そのトークンを切った写しを作る。無ければ null */
export function splitAttribution(s: Sentence): { head: Token[]; tail: Token[] } | null {
  const i = s.tokens.findIndex((t) => SPACE_RUN.test(t.text));
  if (i < 0) return null;
  const t = s.tokens[i];
  const m = t.text.match(SPACE_RUN)!;
  const before = t.text.slice(0, m.index);
  const after = t.text.slice(m.index! + m[0].length);
  const head = [...s.tokens.slice(0, i), ...(before ? [{ ...t, text: before }] : [])];
  const tail = [...(after ? [{ ...t, text: after }] : []), ...s.tokens.slice(i + 1)].filter((x) => !/^[　 ]*$/.test(x.text));
  if (head.length === 0 || tail.length === 0) return null;
  return { head, tail };
}

/** 句の切れ目の印を作る。切れ目がトークンの境界に無ければ、その切れ目は付けない（語を割らない） */
export function kuMarks(tokens: Token[], ku: number[] | undefined, form: WakaPoemBlock["form"]): Map<string, "space" | "break"> | undefined {
  if (!ku || ku.length === 0) return undefined;
  const m = new Map<string, "space" | "break">();
  ku.forEach((cut, k) => {
    const t = tokens.find((x) => x.end === cut);
    if (!t) return;
    // 短歌は第三句の後ろ（上の句／下の句）で行を替える
    m.set(t.id, form === "tanka" && k === 2 ? "break" : "space");
  });
  return m;
}

export const pieceText = (p: Piece): string => p.tokens.map((t) => t.text).join("");

const whole = (s: Sentence): Piece => ({ sentence: s, tokens: s.tokens });

/** 構成ファイルと文から、画面で描くかたまりを作る。構成ファイルが無ければ1文＝1かたまり（末尾の右寄せだけ分ける） */
export function resolveLayout(layout: WakaLayout | null | undefined, sentences: Sentence[]): RenderBlock[] {
  if (!layout) {
    return sentences.map((s) => {
      const sp = splitAttribution(s);
      return sp
        ? { kind: "prose", piece: { sentence: s, tokens: sp.head }, tail: { sentence: s, tokens: sp.tail } }
        : { kind: "prose", piece: whole(s), tail: null };
    });
  }
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const used = new Set<string>();
  const get = (id: string): Sentence | null => {
    const s = byId.get(id);
    if (!s) return null;
    used.add(id);
    return s;
  };
  const blocks: RenderBlock[] = [];
  for (const b of layout.blocks) {
    if (b.type === "collection") {
      const pieces = b.sentenceIds.map(get).filter((s): s is Sentence => !!s).map(whole);
      blocks.push({ kind: "collection", title: b.title, pieces });
      continue;
    }
    let author: Piece | null = null;
    const headOf = (s: Sentence): Token[] => {
      if (s.id !== b.authorSentenceId) return s.tokens;
      const sp = splitAttribution(s);
      if (!sp) return s.tokens;
      author = { sentence: s, tokens: sp.tail };
      return sp.head;
    };
    const kotobagaki = (b.kotobagaki ?? []).map(get).filter((s): s is Sentence => !!s).map((s) => ({ sentence: s, tokens: headOf(s) }));
    const line = (form: WakaPoemBlock["form"]) => (l: WakaLine): Piece | null => {
      const s = get(l.sentenceId);
      if (!s) return null;
      const tokens = headOf(s);
      return { sentence: s, tokens, kuMarks: kuMarks(tokens, l.ku, form) };
    };
    const lines = b.lines.map(line(b.form)).filter((p): p is Piece => !!p);
    // 反歌は短歌（上の句／下の句で行を替える）
    const hanka = (b.hanka ?? []).map(line("tanka")).filter((p): p is Piece => !!p);
    blocks.push({ kind: "poem", form: b.form, category: b.category, kotobagaki, author, lines, hanka });
  }
  // 構成ファイルに無い文は落とさず、末尾に地の文として足す（検査 T17 で無いはずだが安全弁）
  for (const s of sentences) if (!used.has(s.id)) blocks.push({ kind: "prose", piece: whole(s), tail: null });
  return blocks;
}

/**
 * 逐語訳の区切りから、右寄せの名前・出典と、スペースだけの区切りを除く。
 * 名前は末尾側の1つだけ落とす（「額田王の歌　　額田王」のように詞書の中にも同じ名前が出る）
 */
export function dropAttributionPairs<T extends readonly [string, string, ...unknown[]]>(pairs: T[], tailText: string | null): T[] {
  const tail = tailText?.replace(/[\s　]/g, "") ?? "";
  const strip = (s: string) => s.replace(/[\s　]/g, "");
  let dropAt = -1;
  if (tail) {
    for (let i = pairs.length - 1; i >= 0; i--) {
      if (strip(pairs[i][0]) === tail) {
        dropAt = i;
        break;
      }
    }
  }
  return pairs.filter(([orig], i) => i !== dropAt && strip(orig) !== "");
}
