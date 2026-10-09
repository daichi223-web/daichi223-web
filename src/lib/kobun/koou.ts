/**
 * 品詞分解プリントで示す「下の語と呼応するもの」を、教材データ（grammarTag）だけから機械で見つける。
 * - 係り結び: 係助詞 ぞ・なむ・や・か（やは・かは）→ 連体形、こそ → 已然形
 * - 断定「に」＋あり系: 断定の「に」から（て・は・も・こそ 等をはさんで）あり・侍り・候ふ・おはす 等へ
 * - 呼応の副詞: え〜打消、な〜そ、よも〜じ、つゆ・さらに・をさをさ・たえて・おほかた・ゆめ〜打消
 * 見つからないものは推測で補わない（係り結びは「結びの省略・流れ」と書いて本文で確かめさせる）。
 */
import type { Token } from "./types";

export type KoouKind = "係り結び" | "断定" | "呼応";

export interface Koou {
  no: number;
  kind: KoouKind;
  fromId: string;
  toId: string | null;
  note: string;
}

const PUNCT = /^[、。，．「」『』（）・！？〔〕\s]+$/;
const KAKARI = new Set(["ぞ", "そ", "なむ", "なん", "や", "か", "こそ", "やは", "かは"]);
const PRED = new Set(["動詞", "補助動詞", "形容詞", "形容動詞", "助動詞"]);
const ARI = ["あり", "あら", "ある", "あれ", "あん", "侍", "はべ", "候", "さぶら", "さうら", "おはす", "おはせ", "おはし", "おはする", "おはしま", "ます", "いま"];
const BETWEEN = new Set(["て", "は", "も", "こそ", "ぞ", "や", "か", "なむ", "し", "しも"]);

const ADVERBS: Record<string, { need: (t: Token) => boolean; note: (to: string) => string }> = {
  え: { need: isUchikeshi, note: (to) => `え…${to}（呼応：え〜打消＝〜できない）` },
  な: { need: (t) => t.text === "そ" && (tag(t).meaning ?? "").includes("禁止"), note: (to) => `な…${to}（呼応：な〜そ＝〜するな）` },
  よも: { need: (t) => t.text === "じ", note: (to) => `よも…${to}（呼応：よも〜じ＝まさか〜ないだろう）` },
  つゆ: { need: isUchikeshi, note: (to) => `つゆ…${to}（呼応：つゆ〜打消＝少しも〜ない）` },
  さらに: { need: isUchikeshi, note: (to) => `さらに…${to}（呼応：さらに〜打消＝まったく〜ない）` },
  をさをさ: { need: isUchikeshi, note: (to) => `をさをさ…${to}（呼応：をさをさ〜打消＝ほとんど〜ない）` },
  たえて: { need: isUchikeshi, note: (to) => `たえて…${to}（呼応：たえて〜打消＝まったく〜ない）` },
  おほかた: { need: isUchikeshi, note: (to) => `おほかた…${to}（呼応：おほかた〜打消＝まったく〜ない）` },
  ゆめ: { need: (t) => isUchikeshi(t) || (tag(t).meaning ?? "").includes("禁止"), note: (to) => `ゆめ…${to}（呼応：ゆめ〜禁止・打消＝決して〜するな・ない）` },
};

function tag(t: Token) {
  return (t.grammarTag ?? { pos: "" }) as { pos: string; meaning?: string; conjugationForm?: string; baseForm?: string };
}

/** あり系の語の終止形（データに無いときは表記の頭から決める） */
function ariBase(t: Token): string {
  const base = tag(t).baseForm;
  if (base) return base;
  if (t.text.startsWith("あ")) return "あり";
  if (t.text.startsWith("はべ") || t.text.startsWith("侍")) return "はべり";
  if (t.text.startsWith("さぶら") || t.text.startsWith("さうら") || t.text.startsWith("候")) return "さぶらふ";
  if (t.text.startsWith("おはしま")) return "おはします";
  if (t.text.startsWith("おは")) return "おはす";
  return t.text;
}

function isUchikeshi(t: Token): boolean {
  return (tag(t).meaning ?? "").includes("打消");
}

function isPunct(t: Token | undefined): boolean {
  return !t || PUNCT.test(t.text);
}

/** 句読点・括弧で始まるトークン（「、また」のようにつながっていることがある）も区切りとみなす */
function startsWithPunct(t: Token | undefined): boolean {
  return !t || PUNCT.test(t.text.charAt(0));
}

/** 結びとして受け入れる: 次が文末・句読点・閉じ括弧・引用の「と」・終助詞・接続助詞（逆接のこそ〜已然形、など） */
function endsPredicate(next: Token | undefined): boolean {
  if (!next || startsWithPunct(next)) return true;
  const p = tag(next).pos;
  if (p === "終助詞") return true;
  if (p === "格助詞" && (next.text === "と" || next.text === "とて")) return true;
  if (p === "副助詞" && next.text === "など") return true;
  return false;
}

export function findKoou(tokens: Token[]): Koou[] {
  // 句読点の無い文（和歌・句）は、結びのあとに名詞が続いても句切れとして受け入れる
  const isVerse = !tokens.some((t) => /[、。]/.test(t.text));
  const out: Koou[] = [];
  const used = new Set<string>();
  const add = (kind: KoouKind, from: Token, to: Token | null, note: string) => {
    out.push({ no: out.length + 1, kind, fromId: from.id, toId: to?.id ?? null, note });
    if (to) used.add(to.id);
  };

  tokens.forEach((t, i) => {
    const g = tag(t);

    // 係り結び
    if (g.pos === "係助詞" && KAKARI.has(t.text)) {
      const nx = tokens[i + 1];
      // 文末の「や」「か」「かは」、引用の「と」が続く「〜やと」は結びを取らない
      // （読点は文の途中なので結びを探す。「庭などこそ、見どころ多けれ」）
      // 文末の「ぞかし」も結びを取らない
      if (nx && nx.text.startsWith("かし")) return;
      if (!nx || /^[。」』？！）]/.test(nx.text) || (tag(nx).pos === "格助詞" && (nx.text === "と" || nx.text === "とて"))) return;
      const need = t.text === "こそ" ? "已" : "体";
      let weak: Token | null = null;
      for (let j = i + 1; j < tokens.length; j++) {
        const c = tokens[j];
        if (used.has(c.id)) continue;
        const cg = tag(c);
        if (!PRED.has(cg.pos) || cg.conjugationForm !== need) continue;
        const nextTok = tokens[j + 1];
        if (nextTok && tag(nextTok).pos === "助動詞") continue; // 述語の途中
        if (endsPredicate(nextTok)) {
          add("係り結び", t, c, `${t.text}…${c.text}（係り結び：${need === "已" ? "已然形" : "連体形"}）`);
          return;
        }
        if (!weak && (isVerse || need === "已")) weak = c;
      }
      if (weak) {
        add("係り結び", t, weak, `${t.text}…${weak.text}（係り結び：${need === "已" ? "已然形" : "連体形"}）`);
        return;
      }
      add("係り結び", t, null, `${t.text}（結びの省略・流れ。本文で確かめる）`);
      return;
    }

    // 断定「に」＋あり系
    if (t.text === "に" && (g.meaning ?? "") === "断定") {
      for (let j = i + 1; j < Math.min(tokens.length, i + 4); j++) {
        const c = tokens[j];
        if (ARI.some((a) => c.text.startsWith(a)) && (tag(c).pos === "動詞" || tag(c).pos === "補助動詞")) {
          add("断定", t, c, `に…${c.text}（断定「に」＋「${ariBase(c)}」＝〜である）`);
          return;
        }
        // 「にや。」「にか。」「にこそ。」: 下の「あらむ」「あらめ」などが省略された形
        if ((c.text === "や" || c.text === "か" || c.text === "こそ") && startsWithPunct(tokens[j + 1])) {
          const omit = c.text === "こそ" ? "あらめ" : "あらむ";
          add("断定", t, null, `に${c.text}（断定「に」＋「${c.text}」：下に「${omit}」などが省略）`);
          return;
        }
        if (!BETWEEN.has(c.text)) return;
      }
      return;
    }

    // 呼応の副詞
    const adv = g.pos === "副詞" ? ADVERBS[t.text] : undefined;
    if (adv) {
      for (let j = i + 1; j < tokens.length; j++) {
        if (adv.need(tokens[j])) {
          add("呼応", t, tokens[j], adv.note(tokens[j].text));
          return;
        }
      }
    }
  });
  return out;
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
export function circled(n: number): string {
  return CIRCLED[n - 1] ?? `(${n})`;
}

/** トークンIDごとの印（「係①」「結①」「断②」「呼③」） */
export function koouMarks(list: Koou[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const put = (id: string, s: string) => m.set(id, [...(m.get(id) ?? []), s]);
  for (const k of list) {
    const n = circled(k.no);
    if (k.kind === "係り結び") {
      put(k.fromId, `係${n}`);
      if (k.toId) put(k.toId, `結${n}`);
    } else {
      const head = k.kind === "断定" ? "断" : "呼";
      put(k.fromId, `${head}${n}`);
      if (k.toId) put(k.toId, `${head}${n}`);
    }
  }
  return m;
}
