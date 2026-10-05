import type { Word } from '../../types';
import { describeNorm, type WritingJudgeResult } from '../../lib/writingJudge';

/** 意味の表示名（辞書形があればそれ、なければ穴埋め断片の中身） */
export const senseLabel = (w: Word): string => {
  if (w.senseNorm) return w.senseNorm;
  const m = w.sense.match(/〔\s*(.+?)\s*〕/);
  return m ? m[1].trim() : w.sense;
};

// 記述の入力欄の文言。どこまで書けばよいか（語義をひとこと。活用・敬語の形は見ない）を伝える
export function writingPrompt(lemma: string, hasExample: boolean): { label: string; note: string; placeholder: string } {
  return {
    label: hasExample ? `この文での「${lemma}」の意味を、ひとことで` : `「${lemma}」の意味を、ひとことで`,
    note: '活用や敬語の形は問いません',
    placeholder: '意味をひとことで',
  };
}

// 自己判定の文言。正解の言い方が複数あるときは「どれか1つ」でよいと伝える
export function selfJudgePrompt(w: Word): string {
  return describeNorm(w.senseNorm).options.length > 1
    ? '正解のどれか1つと同じ意味なら ○。活用のちがいは気にしない'
    : '正解と同じ意味なら ○。活用のちがいは気にしない';
}

// 記述の判定の見出し。点数ではなく「どの意味で読んだか」を伝える
export function writingHeadline(result: WritingJudgeResult): { mark: string; text: string; color: string } {
  switch (result.verdict) {
    case 'correct':
      return { mark: '○', text: '正解', color: 'var(--rw-accent)' };
    case 'other_sense':
      return { mark: '△', text: '別の意味で読んでいます', color: 'var(--rw-pop)' };
    case 'modern_trap':
      return { mark: '△', text: '現代語の意味で読んでいます', color: 'var(--rw-pop)' };
    case 'wrong':
      return { mark: '×', text: 'この文脈の意味ではありません', color: 'var(--rw-primary)' };
    case 'blank':
      return { mark: '×', text: '答えが書かれていません', color: 'var(--rw-primary)' };
    default:
      return result.partial
        ? { mark: '？', text: '正解と一部が重なっています', color: 'var(--rw-ink-soft)' }
        : { mark: '？', text: '自動では判定できませんでした', color: 'var(--rw-ink-soft)' };
  }
}

/** 選択肢・意味ボタンに出す意味。外側の 〔 〕 と前後の空白だけを外す（中身は活用形のまま。データは変えない） */
export const stripSenseBrackets = (sense: string): string => {
  const raw = sense ?? '';
  const stripped = raw.replace(/〔\s*([^〔〕]*?)\s*〕/g, '$1').trim();
  return stripped || raw.trim();
};

/** 訳に答えの穴（〔 〕）があるか */
export const hasAnswerBlank = (translation: string | undefined): boolean =>
  /〔[^〔〕]*〕/.test(translation ?? '');

/**
 * 回答前に出す訳。〔 〕 の中身（＝答え）を伏せる。
 * 〔 〕 の無い訳（教材の実戦例文など）は答えの語を隠せないので null（回答前は出さない）。
 */
export function maskTranslation(translation: string | undefined): string | null {
  if (!translation || !hasAnswerBlank(translation)) return null;
  return translation.replace(/〔[^〔〕]*〕/g, '〔　？　〕');
}

/**
 * 例文つきで出題できる意味か。
 * 例文理解・文脈記述は、画面に出す意味と採点・記録する意味をこの条件1つでそろえる。
 */
export const hasQuizExample = (m: Word | null | undefined): m is Word =>
  !!m && !!m.qid && !!m.examples?.[0]?.jp;

/** 見出し語の意味のうち、画面に出して採点する意味（例文のあるもの） */
export const quizMeanings = (word: { meanings?: Word[] } | null | undefined): Word[] =>
  (word?.meanings ?? []).filter(hasQuizExample);

/** 入力欄の Enter で採点・次の欄へ進めてよいか。かな漢字変換の確定の Enter は除く */
export function isSubmitEnter(e: {
  key: string;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
}): boolean {
  if (e.key !== 'Enter') return false;
  return !(e.nativeEvent?.isComposing || e.keyCode === 229);
}

/**
 * 正誤を示す色。薄い地＋濃い文字（rw-ink）＋枠にする。
 * 濃い地に白抜き文字は、テーマによっては読めないので使わない。
 */
export const softTone = (color: string): { background: string; borderColor: string } => ({
  background: `color-mix(in srgb, ${color} 40%, var(--rw-paper))`,
  borderColor: color,
});

/** 回答後の選択肢に付ける色。softTone に外枠を足して太く見せる（大きさは変えない） */
export const answerTone = (color: string): { background: string; borderColor: string; boxShadow: string } => ({
  ...softTone(color),
  boxShadow: `0 0 0 2px ${color}`,
});

/** スクロールの動き。「視差効果を減らす」設定のときは一瞬で移る */
export const scrollBehavior = (): ScrollBehavior =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
