/**
 * 単語一覧（/vocab）と単語カード（/word/:lemma）で使う、索引と「見分け方」の純関数（2026-11-15）。
 *
 * ユーザー指示「単語一覧をもっと索引的に」「各語のなかで、見分ける法則を分かるように」
 * 「見分け方は単語カードの中にも出して」。
 *   - 見分け方 = 多義語の意味ごとの決め手（kobunQ v2 の decider.rule・clue）を並べたもの。
 *     データにある文だけを出し、新しい文は作らない。
 *   - 索引 = 五十音の行（あ・か・さ…）か、単語帳の番号の50語ごとの帯。
 * DOM に触れない（描くのは pages/VocabHome.tsx・pages/VocabCard.tsx）。
 */
import deciderTypesJson from '@/data/decider-types.json';

export type DistinguishSense = {
  qid: string;
  sense: string;
  senseNorm?: string;
  meaning_idx?: number;
  decider?: { clue?: string; rule?: string };
};

/**
 * 決め手の型の札（2026-11-15 見本。8語だけ・AI 判定・教員未確認）。
 * 「見分ける」（単語道場）の型を、語ごとの見分け方に札として付ける。札の無い意味は札を出さない。
 */
const DT = deciderTypesJson as { types: Record<string, string>; senses: Record<string, string> };
export const DECIDER_TYPES: Readonly<Record<string, string>> = DT.types;
export function deciderTypeOf(qid: string): string | undefined {
  const t = DT.senses[qid];
  return t && t in DT.types ? t : undefined;
}

export type DistinguishRow = { qid: string; label: string; rule: string; clue?: string; type?: string };

/** 〔 〕 の中だけを取り出す（無ければそのまま） */
export function senseLabel(s: { sense: string; senseNorm?: string }): string {
  if (s.senseNorm) return s.senseNorm;
  const m = (s.sense || '').match(/〔\s*(.+?)\s*〕/);
  return (m ? m[1] : s.sense || '').trim();
}

/**
 * 見分け方の行（意味の並び順）。意味が2つ以上あり、決め手の文がある意味が2つ以上ある語だけ。
 * 決め手が無い意味は行に出さない（推測で埋めない）。
 */
export function distinguishRows(senses: DistinguishSense[]): DistinguishRow[] {
  if (senses.length < 2) return [];
  const rows = [...senses]
    .sort((a, b) => (a.meaning_idx ?? 0) - (b.meaning_idx ?? 0))
    .filter((s) => (s.decider?.rule ?? '').trim() !== '')
    .map((s) => ({
      qid: s.qid,
      label: senseLabel(s),
      rule: s.decider!.rule!.trim(),
      clue: s.decider?.clue?.trim() || undefined,
      type: deciderTypeOf(s.qid),
    }));
  return rows.length >= 2 ? rows : [];
}

/**
 * 決め手の文の中に〈意味〉が書いてあるか。書いてあれば、見分け方の行に意味の名前を出さない（2026-11-15 ユーザー指示
 * 「気づくと目を覚ますも要らない。説明の中にある」「はずして」）。多義語の決め手616のうち15は〈 〉が無い
 * （「…なら下二段」「同上」など）ので、そのときだけ名前を出す。
 */
export function ruleShowsMeaning(rule: string | undefined): boolean {
  return /〈[^〉]+〉/.test(rule ?? '');
}

/** 五十音の行の見出し（並び順） */
export const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'] as const;
/** かなで始まらない語（漢字の見出しなど）の行。読みは推測しないので、ここにまとめる */
export const OTHER_ROW = '他';

const ROW_MEMBERS: Record<string, string> = {
  あ: 'あいうえおぁぃぅぇぉゔ',
  か: 'かきくけこゕゖ',
  さ: 'さしすせそ',
  た: 'たちつてとっ',
  な: 'なにぬねの',
  は: 'はひふへほ',
  ま: 'まみむめも',
  や: 'やゆよゃゅょ',
  ら: 'らりるれろ',
  わ: 'わゐゑをんゎ',
};

/** 見出しの先頭の「～」「〜」を外す（～あへず → あへず） */
export function indexBase(lemma: string): string {
  return (lemma || '').replace(/^[～〜~]+/, '');
}

/** 語の五十音の行（あ・か…）。かなで始まらなければ OTHER_ROW */
export function kanaRowOf(lemma: string): string {
  let c = indexBase(lemma).charAt(0);
  if (!c) return OTHER_ROW;
  const code = c.charCodeAt(0);
  // カタカナ → ひらがな
  if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60);
  // 濁点・半濁点を外す（が → か）
  c = c.normalize('NFD').charAt(0);
  for (const row of KANA_ROWS) if (ROW_MEMBERS[row].includes(c)) return row;
  return OTHER_ROW;
}

const collator = new Intl.Collator('ja');
/** 五十音順の比較（先頭の～は無視） */
export function compareKana(a: string, b: string): number {
  return collator.compare(indexBase(a), indexBase(b));
}

/** 単語帳の番号の帯（50語ごと）。番号の無い語（9999）は「追加」 */
export const BAND_SIZE = 50;
export function numberBandOf(group: number): string {
  if (!Number.isFinite(group) || group >= 9999 || group < 1) return '追加';
  const start = Math.floor((group - 1) / BAND_SIZE) * BAND_SIZE + 1;
  return `${start}–${start + BAND_SIZE - 1}`;
}
