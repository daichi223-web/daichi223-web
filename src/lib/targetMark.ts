/**
 * 例文の中で「問われている語」がどこにあるかを決める。
 *
 * 優先順: ① 例文に付いてきた位置（実戦例文 corpus-examples.json の mark。呼び出し側が渡す）
 *         ② データの位置（kobunQ.v2.slim の examples[].mark。空欄つき例文との差分から生成）
 *         ③ 見出し語を活用させて例文と照合 ④ どれも無ければ印なし。
 * 活用した形のまま・正しい位置に印を付けるためのもので、判定には使わない。
 * 純粋関数。DB・画面には触れない。
 */
import type { Word } from '../types';

/** [開始, 長さ]（文字列の添字。slim の mark と同じ形） */
export type Span = [number, number];

export interface TargetSpans {
  spans: Span[];
  /** data = データの位置 / match = 活用照合 / none = 印なし */
  source: 'data' | 'match' | 'none';
}

/**
 * 照合での印を付けない語（qid）。照合が別の語を指してしまう語を入れる。
 * データの位置（mark）がある例文には影響しない。
 */
export const NO_MATCH_QIDS: ReadonlySet<string> = new Set<string>([
  '48-1', // な～そ: 「身も亡びなむ、かくなせそ」で「なむ」の「な」に当たる
  '55-1', // めづ: 教材例文が「めづらし」「めづらか」（別の語）
  '64-1', // わたる: 教材例文が「眉のわたり」（名詞）
  '64-3', // わたる: 同上
]);

// 動詞の活用語尾の行。見出し語（終止形）の末尾1字から引く
const VERB_ROWS: Record<string, string> = {
  く: 'かきくけ',
  ぐ: 'がぎぐげ',
  す: 'さしすせ',
  ず: 'ざじずぜ',
  つ: 'たちつて',
  づ: 'だぢづで',
  ぬ: 'なにぬね',
  ふ: 'はひふへ',
  ぶ: 'ばびぶべ',
  む: 'まみむめ',
  ゆ: 'やいゆえ',
  る: 'らりるれ',
  り: 'らりるれ', // ラ変（あり・はべり）
  う: 'わゐうゑあいえ', // ワ行・ア行
};
const U_DAN = 'くぐすずつづぬふぶむゆるう';
// イ・ウ・促・撥音便
const ONBIN = 'いうっん';

const ADJ_ENDINGS = ['けれ', 'から', 'かり', 'かる', 'かれ', 'く', 'き', 'う'];
const ADJ_VERB_ENDINGS = ['なり', 'なる', 'なれ', 'なら', 'たり', 'たる', 'に', 'な', 'と'];

/** 見出し語を、照合に使う語へ分ける。「え～打消」→ え ／「きこゆ・きこえさす」→ きこゆ, きこえさす */
function lemmaForms(lemma: string): string[] {
  let src = (lemma ?? '').trim();
  // 「～」より前を語とする（「～あへず」のように前が無ければ後ろ）
  const tilde = src.split(/[～〜~]/);
  if (tilde.length > 1) src = tilde.find((p) => p.trim()) ?? '';
  const out = new Set<string>();
  // 括弧は、外した形と中身の両方を試す
  const bare = src.replace(/[（(][^（）()]*[）)]/g, '');
  const inner = [...src.matchAll(/[（(]([^（）()]*)[）)]/g)].map((m) => m[1]);
  for (const part of [bare, ...inner]) {
    for (const p of part.split(/[・/／]/)) {
      const t = p.trim();
      if (t) out.add(t);
    }
  }
  return [...out];
}

/** 末尾の出典括弧 …（徒然草） の手前までを照合の範囲にする */
function bodyLength(text: string): number {
  const m = text.match(/[（(][^（）()]*[）)]\s*$/);
  return m && m.index !== undefined ? m.index : text.length;
}

/** stem が at にあるとして、活用語尾まで含めた長さを返す。活用形として読めなければ 0 */
function inflectedLength(text: string, at: number, form: string, pos: string | undefined, limit: number): number {
  if (pos === '動詞') {
    const row = VERB_ROWS[form.slice(-1)];
    const stem = form.slice(0, -1);
    if (!row || stem.length < 2) return 0;
    const next = text[at + stem.length];
    if (!next || at + stem.length >= limit) return 0;
    if (row.includes(next)) {
      // ウ段＋「る／れ」は二段・サ変の連体形・已然形
      const after = text[at + stem.length + 1];
      const extend = U_DAN.includes(next) && at + stem.length + 1 < limit && (after === 'る' || after === 'れ');
      return stem.length + (extend ? 2 : 1);
    }
    return ONBIN.includes(next) ? stem.length + 1 : 0;
  }
  if (pos === '形容詞') {
    const last = form.slice(-1);
    const stem = form.slice(0, -1);
    if (stem.length < 2 || !'しじき'.includes(last)) return 0;
    const rest = text.slice(at + stem.length, limit);
    const sibilant = last === 'じ' ? 'じ' : 'し';
    if (rest.startsWith(sibilant)) {
      // シク活用は「し」の後ろの語尾まで伸ばす。無ければ終止形（語幹＋し）
      const e = ADJ_ENDINGS.find((x) => rest.startsWith(x, 1));
      return stem.length + 1 + (e ? e.length : 0);
    }
    if (last === 'じ') return 0;
    const e = ADJ_ENDINGS.find((x) => rest.startsWith(x));
    return e ? stem.length + e.length : 0;
  }
  if (pos === '形容動詞') {
    if (!/(なり|たり)$/.test(form)) return 0;
    const stem = form.slice(0, -2);
    if (stem.length < 2) return 0;
    const rest = text.slice(at + stem.length, limit);
    const e = ADJ_VERB_ENDINGS.find((x) => rest.startsWith(x));
    return e ? stem.length + e.length : 0;
  }
  return 0;
}

/**
 * 見出し語を活用させて例文と照合し、最も前の最も長い1か所を返す。
 * 名詞・副詞・連体詞・連語・品詞なしは完全一致のみ。
 * 語幹が1文字以下になる語は活用照合をしない（誤爆を避ける。完全一致は可）。
 */
export function findInflectedSpan(text: string, lemma: string, pos?: string): Span | null {
  if (!text || !lemma) return null;
  const limit = bodyLength(text);
  let best: Span | null = null;
  const offer = (start: number, length: number) => {
    if (length < 1 || start + length > limit) return;
    if (!best || start < best[0] || (start === best[0] && length > best[1])) best = [start, length];
  };

  for (const form of lemmaForms(lemma)) {
    // 完全一致（終止形のまま出てくる）
    const exact = text.indexOf(form);
    if (exact >= 0) offer(exact, form.length);

    // 活用照合: 語幹の出現位置ごとに、語尾まで読めるかを見る
    const stem =
      pos === '動詞' || pos === '形容詞' ? form.slice(0, -1) : pos === '形容動詞' ? form.slice(0, -2) : '';
    if (stem.length < 2) continue;
    for (let at = text.indexOf(stem); at >= 0 && at < limit; at = text.indexOf(stem, at + 1)) {
      const length = inflectedLength(text, at, form, pos, limit);
      if (length > 0) {
        offer(at, length);
        break; // これより後ろは「最も前」にならない
      }
    }
  }
  return best;
}

/** 範囲が text の中に収まり、重ならずに並んでいるか（明示の位置を使ってよいかの確認） */
function spansFit(text: string, spans: readonly Span[]): boolean {
  let end = 0;
  for (const [start, length] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (!Number.isInteger(start) || !Number.isInteger(length)) return false;
    if (start < end || length < 1 || start + length > text.length) return false;
    end = start + length;
  }
  return spans.length > 0;
}

/**
 * 例文 text の中の、word の対象語の範囲を決める。
 * explicit = その例文に付いてきた位置（実戦例文 corpus-examples.json の mark など）。
 * 優先順: ① explicit ② word.examples の mark ③ 活用照合 ④ 印なし。
 * explicit が text に収まらない（範囲外・重なり）ときは使わずに ② 以降へ進む。
 */
export function resolveTargetSpans(
  text: string,
  word: Pick<Word, 'qid' | 'lemma' | 'pos' | 'examples'>,
  explicit?: readonly Span[]
): TargetSpans {
  if (!text || !word) return { spans: [], source: 'none' };

  if (explicit && spansFit(text, explicit)) return { spans: explicit.map(([s, l]) => [s, l] as Span), source: 'data' };

  const mark = word.examples?.find((e) => e.jp === text)?.mark;
  if (mark && mark.length > 0) return { spans: mark, source: 'data' };

  if (!NO_MATCH_QIDS.has(word.qid)) {
    const span = findInflectedSpan(text, word.lemma, word.pos);
    if (span) return { spans: [span], source: 'match' };
  }
  return { spans: [], source: 'none' };
}

/** 範囲で文を切り分ける。範囲外・重なりは捨てる */
export function splitBySpans(text: string, spans: Span[]): { text: string; marked: boolean }[] {
  const out: { text: string; marked: boolean }[] = [];
  let pos = 0;
  for (const [start, length] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (!Number.isInteger(start) || !Number.isInteger(length)) continue;
    if (start < pos || length < 1 || start + length > text.length) continue;
    if (start > pos) out.push({ text: text.slice(pos, start), marked: false });
    out.push({ text: text.slice(start, start + length), marked: true });
    pos = start + length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), marked: false });
  return out;
}
