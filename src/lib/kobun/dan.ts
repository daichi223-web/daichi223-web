// 五十音の段（ア段・イ段・ウ段・エ段・オ段）と、動詞の活用の種類の名前のわけ（2026-11-16、ユーザー指示
// 「四段、上二、下二などがなぜなのかも説明が必要。色を変えて四段だと分かるようにしたい」）。
// 色は src/index.css の --dan-a 〜 --dan-o。活用表の太字の語尾・「ア段」などの語・段の図で同じ色を使う。

export type Dan = "a" | "i" | "u" | "e" | "o";
export const DANS: Dan[] = ["a", "i", "u", "e", "o"];
export const DAN_LABEL: Record<Dan, string> = { a: "ア段", i: "イ段", u: "ウ段", e: "エ段", o: "オ段" };
export const DAN_KANA: Record<Dan, string> = { a: "ア", i: "イ", u: "ウ", e: "エ", o: "オ" };

const ROWS: Record<Dan, string> = {
  a: "あかさたなはまやらわがざだばぱぁゃゎアカサタナハマヤラワガザダバパァャヮ",
  i: "いきしちにひみりゐぎじぢびぴぃイキシチニヒミリヰギジヂビピィ",
  u: "うくすつぬふむゆるぐずづぶぷぅゅっウクスツヌフムユルグズヅブプゥュッ",
  e: "えけせてねへめれゑげぜでべぺぇエケセテネヘメレヱゲゼデベペェ",
  o: "おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョ",
};
const KANA_DAN = new Map<string, Dan>();
for (const d of DANS) for (const ch of ROWS[d]) KANA_DAN.set(ch, d);

/** 文字列の最初の字の段。かな（ひらがな・カタカナ）か、ローマ字の母音（a・i・u・e・o）で始まるときだけ。 */
export function danOf(text: string): Dan | null {
  const t = text.trim();
  if (!t) return null;
  const c = t[0];
  if (/^[aiueo]/.test(t)) return c as Dan;
  return KANA_DAN.get(c) ?? null;
}

/** 活用表（見出しに「未然」と「連用」がある表）か */
export function isKatsuyoTable(headers: string[]): boolean {
  const h = headers.join(" ");
  return h.includes("未然") && h.includes("連用");
}

/** 活用の種類ごとに、語尾が使う段（名前のわけ）。ウ段を真ん中に、上＝イ段、下＝エ段。 */
export const DAN_TYPES: { name: string; dans: Dan[]; why: string }[] = [
  { name: "四段", dans: ["a", "i", "u", "e"], why: "ア・イ・ウ・エの4つの段を使う" },
  { name: "上二段", dans: ["i", "u"], why: "ウ段と、その上のイ段の2つの段" },
  { name: "下二段", dans: ["u", "e"], why: "ウ段と、その下のエ段の2つの段" },
  { name: "上一段", dans: ["i"], why: "ウ段の上のイ段の1つの段だけ" },
  { name: "下一段", dans: ["e"], why: "ウ段の下のエ段の1つの段だけ" },
];

/** 段の図の行。`[段の図:四段,上二段]` の名前から。知らない名前は捨てる。 */
export function danChartRows(names: string[]): typeof DAN_TYPES {
  return names.map((n) => DAN_TYPES.find((t) => t.name === n.trim())).filter((t): t is (typeof DAN_TYPES)[number] => !!t);
}

/** `[段の図:四段,上二段,下二段]` の行なら名前の並び、そうでなければ null */
export function parseDanChartLine(line: string): string[] | null {
  const m = /^\[段の図[:：]([^\]]+)\]$/.exec(line.trim());
  return m ? m[1].split(/[,、・]/).map((s) => s.trim()).filter(Boolean) : null;
}

/** 文中の「ア段」「イ段」…を色を付ける部分に分ける */
export function splitDanWords(text: string): { text: string; dan: Dan | null }[] {
  const out: { text: string; dan: Dan | null }[] = [];
  const re = /[アイウエオ]段/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), dan: null });
    out.push({ text: m[0], dan: KANA_DAN.get(m[0][0]) ?? null });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), dan: null });
  return out;
}
