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

/** 文末の言い回しを落とす（気づいた→気づい、通っている→通っ） */
const TAIL = /(ている|ていた|ました|ます|です|である|こと|た|て|だ|で)$/;

/** 活用のゆれを吸収する粗い語幹。短くなりすぎる語は削らない */
function stem(s: string): { stem: string; cut: boolean } {
  let x = s;
  const t = x.replace(TAIL, '');
  if (t.length >= 2) x = t;
  if (x.length >= 3 && /[ぁ-ん]$/.test(x)) return { stem: x.slice(0, -1), cut: true };
  return { stem: x, cut: false };
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

type Keys = { raw: string; stem: string; cut: boolean; neg: boolean; yomi?: string; yomiStem?: string; yomiCut?: boolean };

function keysOf(s: string, toReading?: (s: string) => string): Keys {
  const st = stem(s);
  const k: Keys = { raw: s, stem: st.stem, cut: st.cut, neg: isNegative(s) };
  if (toReading) {
    k.yomi = normalizeAnswer(toReading(s));
    const ys = stem(k.yomi);
    k.yomiStem = ys.stem;
    k.yomiCut = ys.cut;
  }
  return k;
}

// 語幹どうしの一致は、両方とも語尾を落とした（または両方落としていない）ときだけ認める。
// 「ある」と「歩く→ある」のような、短い語の偶然の一致を避ける。
function same(a: Keys, b: Keys): boolean {
  if (a.raw === b.raw) return true;
  if (a.neg !== b.neg) return false;
  if (a.stem.length >= 2 && a.stem === b.stem && a.cut === b.cut) return true;
  if (a.yomi && b.yomi) {
    if (a.yomi === b.yomi) return true;
    if (a.yomiStem!.length >= 2 && a.yomiStem === b.yomiStem && a.yomiCut === b.yomiCut) return true;
  }
  return false;
}

function contains(a: Keys, b: Keys): boolean {
  if (a.neg !== b.neg) return false;
  const pair = (x?: string, y?: string) =>
    !!x && !!y && x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
  return pair(a.stem, b.stem) || pair(a.yomiStem, b.yomiStem);
}

/** 並べ書きの区切り。「意地が悪い・ひどい」「意地が悪い、ひどい」「ひどい 意地が悪い」 */
const LIST_SEP = /[・･、，,／/\s]+/;

/** 回答を並べ書きの部分に分ける。normalizeAnswer は区切りを落とすので、正規化の前の回答で分ける */
const splitListed = (answer: string): string[] =>
  answer.split(LIST_SEP).map(normalizeAnswer).filter(Boolean);

export function judgeWriting(input: WritingJudgeInput): WritingJudgeResult {
  const { target, siblings = [], accepted = [], rejected = [], toReading } = input;
  const norm = normalizeAnswer(input.answer);
  if (!norm) return { verdict: 'blank' };

  const ans = keysOf(norm, toReading);
  const hitBy = (k: Keys, vs: string[]) => vs.some((v) => same(k, keysOf(v, toReading)));
  const hit = (vs: string[]) => hitBy(ans, vs);

  // 教員の判断を自動の照合より先に見る。不正解の指定は活用ちがいにまで広げない
  const exactBy = (k: Keys, v: string) => {
    const kv = keysOf(v, toReading);
    return kv.raw === k.raw || (!!kv.yomi && kv.yomi === k.yomi);
  };
  const rejectedNorm = rejected.map(normalizeAnswer).filter(Boolean);
  const acceptedNorm = accepted.map(normalizeAnswer).filter(Boolean);
  if (rejectedNorm.some((v) => exactBy(ans, v))) return { verdict: 'wrong' };
  if (hit(acceptedNorm)) return { verdict: 'correct' };

  const targetVariants = variantsOf(target);
  const onTarget = hit(targetVariants);
  const sibling = siblings.find((s) => s.qid !== target.qid && hit(variantsOf(s)));
  const partial = targetVariants.some((v) => contains(ans, keysOf(v, toReading)));

  if (onTarget) return sibling ? { verdict: 'correct', overlap: true } : { verdict: 'correct' };

  // 並べて書いた回答（「意地が悪い、ひどい」）は、全部分が正解の言い方なら正解。
  // 別義や現代語の罠が混ざれば、全体での判定（別義・保留）をそのまま返す
  const parts = splitListed(input.answer);
  if (parts.length >= 2) {
    const keys = parts.map((p) => keysOf(p, toReading));
    const allOk = keys.every((k) => hitBy(k, acceptedNorm) || hitBy(k, targetVariants));
    const anyRejected = keys.some((k) => rejectedNorm.some((v) => exactBy(k, v)));
    if (allOk && !anyRejected) return sibling ? { verdict: 'correct', overlap: true } : { verdict: 'correct' };
  }
  // 別義に当たっても、正解の言い方と重なるなら正解（「いつもの」と「いつものように」）
  if (sibling) return partial ? { verdict: 'correct', overlap: true } : { verdict: 'other_sense', matchedQid: sibling.qid };
  if (hit(trapVariantsOf(target))) return { verdict: 'modern_trap' };

  // 1文字の正解（「縁」「旨」）があるので、照合のあとで無回答を判定する
  if (norm.length <= 1) return { verdict: 'blank' };
  return partial ? { verdict: 'pending', partial: true } : { verdict: 'pending' };
}
