/**
 * 記述（意味を書く）の判定。点数ではなく「どの意味で読んだか」を返す。
 *
 * 判定するのは語義の核だけ。活用・時制・敬語の形は問わない。
 * 機械で決まらない答えは pending（保留）にして、呼び出し側が自己判定などへ回す。
 * 純粋関数。DB・画面には触れない。
 */

/** 判定に使う1つの意味（kobunQ.v2.slim の1行と同じ形の一部） */
export interface JudgeSense {
  qid: string;
  /** 訳の穴埋め断片。例: "〔 病気がよくなっ 〕" */
  sense?: string;
  /** 辞書形の意味。例: "意地が悪い・ひどい" "（女のもとに）通う" */
  senseNorm?: string;
  examples?: Array<{ translation?: string }>;
  trap?: { modern?: string };
}

export type WritingVerdict =
  | 'correct'      // この文脈の意味で書けた
  | 'other_sense'  // 同じ語の別の意味を書いた
  | 'modern_trap'  // 現代語の意味で読んだ
  | 'wrong'        // 教員が不正解と決めた言い方
  | 'blank'        // 無回答・1文字
  | 'pending';     // 機械では決まらない

export interface WritingJudgeResult {
  verdict: WritingVerdict;
  /** other_sense のとき、書いてしまった意味の qid */
  matchedQid?: string;
  /** 正解の言い方の一部だけ合っている（保留のうち「惜しい」候補） */
  partial?: boolean;
  /** 別義の言い方にも当たっていた（意味が重なる語。正解として扱う） */
  overlap?: boolean;
}

export interface WritingJudgeInput {
  answer: string;
  target: JudgeSense;
  /** 同じ見出し語の他の意味 */
  siblings?: JudgeSense[];
  /** 教員が正解と認めた言い方（qid ごと） */
  accepted?: string[];
  /** 教員が不正解と決めた言い方（qid ごと）。書いたとおりの言い方だけに効く */
  rejected?: string[];
  /** 読み（かな）へ直す関数。渡せば漢字とかなの表記ちがいを吸収する */
  toReading?: (s: string) => string;
  /**
   * 正規化済みの言い方を「原形の鍵」へ直す関数（形態素解析。baseKeyFromTokens を参照）。
   * 渡せば活用・時制・丁寧の形ちがい（ひどかった／ひどい、思わなかった／思わない）を吸収する
   */
  toBase?: (s: string) => string;
}

const STRIP = /[〔〕（）()「」『』"'\s、。,.・〜~…ー\-‐–—―?？!！]/g;

/** 比較用の正規化: NFKC・記号除去・カタカナ→ひらがな */
export function normalizeAnswer(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .replace(STRIP, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const I_DAN = 'いきぎしじちぢひびぴみり'; // 「に」は除く（「すぐに」の に は助詞。な行の動詞は「死ぬ」程度）
const U_DAN = 'うくぐすずつづぬふぶぷむる';
const E_DAN = 'えけげせぜてでねへべぺめれ';
/** 語幹の2段目で落としてよい末尾（活用語尾になりうる かな）。あ段・お段・に などは落とさない（すぐに／すぐれ、まさか／まさる） */
const CUT2 = new RegExp(`[${I_DAN}${U_DAN}${E_DAN}っん]$`);
/** 連用形の終わり（ます・て・た・ている が付く形）。音便の っ・ん・い を含む */
const RENYO = new RegExp(`[${I_DAN}${E_DAN}っん]$`);
/** 連体形の終わり（こと が付く形）: う段・形容詞の い・形容動詞の な・た */
const RENTAI = new RegExp(`[${U_DAN}いなた]$`);
const ENDS_KANJI = /[㐀-鿿々]$/;

/**
 * 文末の言い回し（気づいた→気づい、通っている→通っ）。直前が付きうる形のときだけ落とす。
 * 「ますます」「仏事」「こと」のように、言い回しと同じ文字で終わる別の語を削らないため。
 */
const TAIL_RULES: Array<{ tail: string; ok: (before: string) => boolean }> = [
  { tail: 'ている', ok: (b) => RENYO.test(b) },
  { tail: 'ていた', ok: (b) => RENYO.test(b) },
  { tail: 'ました', ok: (b) => RENYO.test(b) },
  { tail: 'ます', ok: (b) => RENYO.test(b) },
  { tail: 'です', ok: () => true },
  { tail: 'である', ok: () => true },
  { tail: 'こと', ok: (b) => RENTAI.test(b) },
  { tail: 'た', ok: (b) => RENYO.test(b) || ENDS_KANJI.test(b) },
  { tail: 'て', ok: (b) => RENYO.test(b) || ENDS_KANJI.test(b) },
  { tail: 'だ', ok: () => true },
  { tail: 'で', ok: () => true },
  // 形容動詞の連体・連用（立派な・気の毒に・おろそかな）。漢字の後か、残りが3文字以上のとき（「すぐに」の に は落とさない）
  { tail: 'な', ok: (b) => ENDS_KANJI.test(b) || b.length >= 3 },
  { tail: 'に', ok: (b) => ENDS_KANJI.test(b) || b.length >= 3 },
];

/** 活用のゆれを吸収する粗い語幹。短くなりすぎる語は削らない（語幹は2文字以上） */
function stem(s: string): { stem: string; cut: boolean } {
  let x = s;
  for (const r of TAIL_RULES) {
    if (!x.endsWith(r.tail)) continue;
    const rest = x.slice(0, -r.tail.length);
    if (rest.length >= 2 && r.ok(rest)) x = rest;
    break; // 末尾で最初に当たった言い回しだけを見る（「ていた」を「た」で削り直さない）
  }
  if (x.length >= 3 && CUT2.test(x)) return { stem: x.slice(0, -1), cut: true };
  return { stem: x, cut: false };
}

/** 形態素解析の1語（kuromoji の token のうち使う項目） */
export interface MorphToken {
  surface_form: string | Uint8Array;
  pos: string;
  pos_detail_1: string;
  basic_form: string;
}

const INFLECT = new Set(['動詞', '形容詞', '助動詞']);

/**
 * 原形の鍵。活用する語（動詞・形容詞・助動詞）は basic_form、ほかは表記のまま並べる。
 * 末尾の時制・丁寧・補助の言い回し（た・ます・です・接続助詞の て/で・「ている/ておる/てある」・
 * 名詞や副詞の後の だ・形容動詞語幹の後の に）は落とす。打消（ない・ぬ）と「こと」は落とさない。
 * 例: ひどかった → ひどい、思わなかった → 思うない、すぐれている → すぐれる、立派な → 立派
 */
export function baseKeyFromTokens(tokens: MorphToken[]): string {
  const x = tokens.map((t) => {
    const s = String(t.surface_form);
    return {
      s,
      pos: t.pos,
      d1: t.pos_detail_1,
      b: t.basic_form,
      k: INFLECT.has(t.pos) && t.basic_form && t.basic_form !== '*' ? t.basic_form : s,
    };
  });
  for (;;) {
    const n = x.length;
    if (n <= 1) break;
    const L = x[n - 1];
    const P = x[n - 2];
    if (L.pos === '助動詞' && ['た', 'ます', 'です'].includes(L.b)) { x.pop(); continue; }
    if (L.pos === '助動詞' && L.b === 'だ' && (P.pos === '名詞' || P.pos === '副詞')) { x.pop(); continue; }
    if (L.pos === '助詞' && L.d1 === '接続助詞' && (L.s === 'て' || L.s === 'で')) { x.pop(); continue; }
    if (L.pos === '助詞' && L.d1 === '副詞化' && L.s === 'に' && P.d1 === '形容動詞語幹') { x.pop(); continue; }
    if (n >= 3 && (L.pos === '動詞' || L.pos === '助動詞') && ['いる', 'おる', 'ある'].includes(L.b) && (P.s === 'て' || P.s === 'で')) {
      x.pop();
      x.pop();
      continue;
    }
    break;
  }
  return x.map((t) => t.k).join('');
}

/** 打消で終わるか。「音を立てる」と「音を立てず」を同じにしないため */
const isNegative = (s: string): boolean => /(ない|ず|ぬ|ません|なかった|ずに|ないで)$/.test(s);

const brackets = (s?: string): string[] =>
  [...(s ?? '').matchAll(/〔\s*(.+?)\s*〕/g)].map((m) => m[1]);

/**
 * "（女のもとに）通う" → ["通う", "女のもとに通う"]
 * "さっきの（ありつる）" → ["さっきの"]（後ろの括弧は注記として捨てる）
 * "意地が悪い・ひどい" → ["意地が悪い", "ひどい"]
 */
export function expandNorm(senseNorm?: string): string[] {
  const src = (senseNorm ?? '').normalize('NFKC');
  if (!src) return [];
  const out: string[] = [];
  const bare = src.replace(/\([^)]*\)/g, '');
  out.push(...bare.split(/[・\/]/));
  const lead = src.match(/^\(([^)]*)\)(.+)$/);
  if (lead && !/[・\/]/.test(lead[1])) {
    out.push(...lead[2].replace(/\([^)]*\)/g, '').split(/[・\/]/).map((p) => lead[1] + p));
  }
  return out;
}

/** 正解の言い方を画面で示すための分解（どこまで書けばよいか） */
export interface NormGuide {
  /** 「・」「/」で分けた、どれか1つでよい言い方（元の表記のまま） */
  options: string[];
  /** 書かなくてよい頭括弧の中身（括弧内に「・」「/」が無いときだけ） */
  optionalLead?: string;
  /** 後ろ・途中の括弧、および「・」入りの頭括弧（注記として小さく出す） */
  notes: string[];
}

// expandNorm は NFKC 後の半角で見る。こちらは元の表記のまま、同じ位置で分ける
const PAREN = /[（(]([^）)]*)[）)]/g;
const SEPARATOR = /[・･/／]/;

/**
 * 表示用。expandNorm と同じ分け方で、判定が正解にする言い方だけを options に出す。
 * "（女のもとに）通う" → options ["通う"], optionalLead "女のもとに"
 * "さっきの（ありつる）" → options ["さっきの"], notes ["ありつる"]
 * "（詠み・作り）申し上げる" → options ["申し上げる"], notes ["詠み・作り"]
 */
export function describeNorm(senseNorm?: string): NormGuide {
  const src = (senseNorm ?? '').trim();
  if (!src) return { options: [], notes: [] };
  const options = src
    .replace(PAREN, '')
    .split(SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  const notes = [...src.matchAll(PAREN)].map((m) => m[1].trim()).filter(Boolean);
  const lead = src.match(/^[（(]([^）)]*)[）)](.+)$/);
  if (lead && lead[1].trim() && !SEPARATOR.test(lead[1])) {
    return { options, optionalLead: lead[1].trim(), notes: notes.slice(1) };
  }
  return { options, notes };
}

/** 呼応・補助の言い方の区切り。「まったく〜ない」の「〜」 */
const TILDE = /[〜~～]/;

/**
 * 正解（または別義）として照合する言い方。正規化後、重複なし。
 * senseNorm の言い方に、訳の穴〔…〕の断片を足す。ただし、その語の意味を表していない断片は単独では登録しない:
 * - 穴が2つ以上ある訳（「〔まったく〕…〔ない〕」「〔お〕…〔申し上げ〕」）の断片は、senseNorm の言い方そのもの、
 *   または senseNorm を「〜」で区切った語そのものの部分（「まったく」「申し上げる」。呼応の相手の打消「ない」と
 *   1文字の「お」「か」は除く）に当たるときだけ登録し、代わりに断片をつないだ形（「まったくない」）を登録する
 * - 1文字の断片（「な」「い」）は登録しない。1文字の正解（「縁」「旨」）は senseNorm の側で登録される
 */
export function variantsOf(s: JudgeSense): string[] {
  const v = new Set<string>();
  const norms = expandNorm(s.senseNorm).map(normalizeAnswer).filter(Boolean);
  for (const n of norms) v.add(n);
  const segments = new Set(
    expandNorm(s.senseNorm)
      .filter((p) => TILDE.test(p))
      .flatMap((p) => p.split(TILDE).map(normalizeAnswer))
      .filter((h) => h.length >= 2 && !isNegative(h)),
  );
  const hasOneCharNorm = norms.some((n) => n.length === 1);
  const addHoles = (text?: string) => {
    const hs = brackets(text).map(normalizeAnswer).filter(Boolean);
    if (hs.length >= 2) {
      const single = hs.filter((h) => norms.includes(h) || segments.has(h));
      for (const h of single) v.add(h);
      // 単独で登録しない断片があるときだけ、つないだ形で登録する（同じ語が2回出る訳は不要）
      if (single.length < hs.length) v.add(hs.join(''));
      return;
    }
    for (const h of hs) if (h.length >= 2 || hasOneCharNorm) v.add(h);
  };
  addHoles(s.sense);
  for (const ex of s.examples ?? []) addHoles(ex.translation);
  v.delete('');
  return [...v];
}

function trapVariantsOf(s: JudgeSense): string[] {
  const v = new Set<string>();
  for (const p of (s.trap?.modern ?? '').normalize('NFKC').split(/[・\/()]/)) v.add(normalizeAnswer(p));
  v.delete('');
  return [...v];
}

type Keys = {
  raw: string;
  stem: string;
  cut: boolean;
  neg: boolean;
  yomi?: string;
  yomiStem?: string;
  yomiCut?: boolean;
  /** 原形の鍵（toBase があるときだけ） */
  base?: string;
  baseYomi?: string;
};

function keysOf(s: string, toReading?: (s: string) => string, toBase?: (s: string) => string): Keys {
  const st = stem(s);
  const k: Keys = { raw: s, stem: st.stem, cut: st.cut, neg: isNegative(s) };
  if (toReading) {
    k.yomi = normalizeAnswer(toReading(s));
    // 表記が漢字で終わる語（道理・程度）は、読みの語尾を活用語尾とみなして削らない（道理→どうり→どう と どうして を一致させない）
    const ys = /[ぁ-ん]$/.test(s) ? stem(k.yomi) : { stem: k.yomi, cut: false };
    k.yomiStem = ys.stem;
    k.yomiCut = ys.cut;
  }
  if (toBase) {
    k.base = toBase(s);
    if (toReading) k.baseYomi = normalizeAnswer(toReading(k.base));
  }
  return k;
}

const kanjiOf = (s: string) => new Set([...s].filter((c) => /[㐀-鿿々]/.test(c)));

/**
 * 読みで照合してよい組か: 片方の漢字がもう片方に全部含まれる（かな書き・送りがな違い）とき。
 * 「立つ／経つ」「疲れ／使う」「古都／こと」のような、読みだけ同じ別の語を一致させない
 */
function readingComparable(a: Keys, b: Keys): boolean {
  const x = kanjiOf(a.raw);
  const y = kanjiOf(b.raw);
  return [...x].every((c) => y.has(c)) || [...y].every((c) => x.has(c));
}

// 語幹どうしの一致は、両方とも語尾を落とした（または両方落としていない）ときだけ認める。
// 「ある」と「歩く→ある」のような、短い語の偶然の一致を避ける。
function same(a: Keys, b: Keys): boolean {
  if (a.raw === b.raw) return true;
  if (a.neg !== b.neg) return false;
  const yomiOk = !!a.yomi && !!b.yomi && readingComparable(a, b);
  if (yomiOk && a.yomi === b.yomi) return true;
  // 原形の鍵（1文字の言い方には使わない）
  if (a.base !== undefined && b.base !== undefined && a.raw.length >= 2 && b.raw.length >= 2) {
    if (a.base === b.base) return true;
    if (yomiOk && a.baseYomi && a.baseYomi === b.baseYomi) return true;
  }
  if (a.stem.length >= 2 && a.stem === b.stem && a.cut === b.cut) return true;
  if (yomiOk && a.yomiStem!.length >= 2 && a.yomiStem === b.yomiStem && a.yomiCut === b.yomiCut) return true;
  return false;
}

function contains(a: Keys, b: Keys): boolean {
  if (a.neg !== b.neg) return false;
  const pair = (x?: string, y?: string) =>
    !!x && !!y && x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
  return pair(a.stem, b.stem) || (readingComparable(a, b) && pair(a.yomiStem, b.yomiStem));
}

/** 並べ書きの区切り。「意地が悪い・ひどい」「意地が悪い、ひどい」「ひどい 意地が悪い」 */
const LIST_SEP = /[・･、，,／/\s]+/;

/** 回答を並べ書きの部分に分ける。normalizeAnswer は区切りを落とすので、正規化の前の回答で分ける */
const splitListed = (answer: string): string[] =>
  answer.split(LIST_SEP).map(normalizeAnswer).filter(Boolean);

export function judgeWriting(input: WritingJudgeInput): WritingJudgeResult {
  const { target, siblings = [], accepted = [], rejected = [], toReading, toBase } = input;
  const norm = normalizeAnswer(input.answer);
  if (!norm) return { verdict: 'blank' };

  const K = (s: string) => keysOf(s, toReading, toBase);
  // 並べて書いた回答は、全体をつないだ形の原形の鍵を使わない（部分ごとの照合では使う）
  const parts = splitListed(input.answer);
  const ans = keysOf(norm, toReading, parts.length >= 2 ? undefined : toBase);
  const hitBy = (k: Keys, vs: string[]) => vs.some((v) => same(k, K(v)));
  const hit = (vs: string[]) => hitBy(ans, vs);

  // 教員の判断を自動の照合より先に見る。不正解の指定は活用ちがいにまで広げない
  const exactBy = (k: Keys, v: string) => {
    const kv = K(v);
    return kv.raw === k.raw || (!!kv.yomi && kv.yomi === k.yomi && readingComparable(kv, k));
  };
  const rejectedNorm = rejected.map(normalizeAnswer).filter(Boolean);
  const acceptedNorm = accepted.map(normalizeAnswer).filter(Boolean);
  if (rejectedNorm.some((v) => exactBy(ans, v))) return { verdict: 'wrong' };
  if (hit(acceptedNorm)) return { verdict: 'correct' };

  const targetVariants = variantsOf(target);
  const onTarget = hit(targetVariants);
  const sibling = siblings.find((s) => s.qid !== target.qid && hit(variantsOf(s)));
  const partial = targetVariants.some((v) => contains(ans, K(v)));

  if (onTarget) return sibling ? { verdict: 'correct', overlap: true } : { verdict: 'correct' };

  // 並べて書いた回答（「意地が悪い、ひどい」）は、全部分が正解の言い方なら正解。
  // 別義や現代語の罠が混ざれば、全体での判定（別義・保留）をそのまま返す
  if (parts.length >= 2) {
    const keys = parts.map((p) => K(p));
    const allOk = keys.every((k) => hitBy(k, acceptedNorm) || hitBy(k, targetVariants));
    const anyRejected = keys.some((k) => rejectedNorm.some((v) => exactBy(k, v)));
    if (allOk && !anyRejected) return sibling ? { verdict: 'correct', overlap: true } : { verdict: 'correct' };
  }
  // 別義に当たり、正解の言い方とは一部だけ重なる回答（「いつもの」と「いつものように」、「少し」と「少しも」）は、
  // 正解にも別義にも決めず保留にする（2026-10-06 ユーザー決定。正しく書いた生徒を落とさず、誤りを正解にもしない）
  if (sibling) return partial ? { verdict: 'pending', partial: true } : { verdict: 'other_sense', matchedQid: sibling.qid };
  if (hit(trapVariantsOf(target))) return { verdict: 'modern_trap' };

  // 1文字の正解（「縁」「旨」）があるので、照合のあとで無回答を判定する
  if (norm.length <= 1) return { verdict: 'blank' };
  return partial ? { verdict: 'pending', partial: true } : { verdict: 'pending' };
}
