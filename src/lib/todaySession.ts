/**
 * 「今日の分」セッションの組み立て（純粋関数）。
 *
 * ねらい: ホームのボタン1つで、中身をアプリが決める短いセッションを出す。
 *   1. おかえりウォームアップ（長い空白のあとだけ。箱4〜5の「覚えていた語」）
 *   2. 今日の復習（期限の古い順・上限つき。srsEngine.getTodayReviewSet）
 *   3. 足りない分は、範囲内の候補から「おまかせ」で補充（苦手→未着手→途中）
 * 合計 TODAY_SIZE 問を基本とし、1+2 だけで超える場合はそのまま（復習を削らない）。
 *
 * DB アクセスは呼び出し側（App.tsx）。ここは配列とマップだけを扱う。
 */
import { pickQuestions, type ItemStat, type Bucket } from './quizSelector';

/** 今日の分の基本サイズ（2〜3分で終わる長さ） */
export const TODAY_SIZE = 10;

export type TodayParts = {
  /** おかえりウォームアップ（覚えていた語） */
  warmup: number;
  /** 今日の復習（期限到来） */
  review: number;
  /** 補充（おまかせ選択） */
  fresh: number;
  /** 補充の内訳（おまかせの分類） */
  freshComposition: Record<Bucket, number> | null;
};

export type TodaySet = { qids: string[]; parts: TodayParts };

export type ComposeInput<T> = {
  warmup: string[];
  due: string[];
  /** 補充候補（範囲内の語） */
  pool: T[];
  key: (t: T) => string;
  order: (t: T) => number;
  stats: Record<string, ItemStat>;
  boxes?: Record<string, number>;
  size?: number;
  now?: Date;
  rng?: () => number;
};

/**
 * 今日の分を組み立てる。順序は warmup → due → fresh（出題は並び順どおり）。
 * 重複 qid は先勝ち。
 */
export function composeTodaySet<T>(input: ComposeInput<T>): TodaySet {
  const size = input.size ?? TODAY_SIZE;
  const seen = new Set<string>();
  const qids: string[] = [];
  const push = (q: string) => {
    if (seen.has(q)) return false;
    seen.add(q);
    qids.push(q);
    return true;
  };

  let warmup = 0;
  for (const q of input.warmup) if (push(q)) warmup++;
  let review = 0;
  for (const q of input.due) if (push(q)) review++;

  const need = size - qids.length;
  let fresh = 0;
  let freshComposition: Record<Bucket, number> | null = null;
  if (need > 0 && input.pool.length > 0) {
    const candidates = input.pool.filter((t) => !seen.has(input.key(t)));
    const r = pickQuestions({
      items: candidates,
      key: input.key,
      order: input.order,
      stats: input.stats,
      boxes: input.boxes,
      n: need,
      now: input.now,
      rng: input.rng,
    });
    for (const t of r.picked) if (push(input.key(t))) fresh++;
    freshComposition = r.composition;
  }

  return { qids, parts: { warmup, review, fresh, freshComposition } };
}

/** ホーム表示用: 補充で何語出るかを、候補を引かずに見積もる */
export function estimateFresh(warmupCount: number, dueCount: number, size = TODAY_SIZE): number {
  return Math.max(0, size - warmupCount - dueCount);
}

export type Growth = {
  /** すでに記録があり、箱が上がった語数 */
  promoted: number;
  /** すでに記録があり、箱が下がった語数 */
  demoted: number;
  /** 箱5（最上位）に入った語の増減 */
  topDelta: number;
  /** 今回はじめて記録がついた語数（初出は昇格に数えない） */
  started: number;
};

/**
 * セッション前後の箱スナップショットから「成長1行」の材料を数える。
 * before に記録が無い語は「初出」= started。初出を昇格に混ぜると、
 * 初回セッションが誤答だらけでも「全部一段上へ」に見えてしまうため分ける。
 */
export function countGrowth(
  qids: string[],
  before: Record<string, number>,
  after: Record<string, number>,
  topBox = 5,
): Growth {
  let promoted = 0;
  let demoted = 0;
  let topDelta = 0;
  let started = 0;
  for (const q of qids) {
    const hadRecord = before[q] != null;
    const b = before[q] ?? 0;
    const a = after[q] ?? 0;
    if (!hadRecord) {
      if (a > 0) started++;
    } else if (a > b) promoted++;
    else if (a < b) demoted++;
    if (a >= topBox && b < topBox) topDelta++;
    else if (a < topBox && b >= topBox) topDelta--;
  }
  return { promoted, demoted, topDelta, started };
}

/** 成長1行の文言。何も言えることが無ければ null（出さない） */
export function growthLine(g: Growth, streakDays: number): string | null {
  const bits: string[] = [];
  if (streakDays >= 2) bits.push(`🔥 ${streakDays}日連続`);
  if (g.promoted > 0) bits.push(`${g.promoted}語が一段上へ`);
  if (g.topDelta > 0) bits.push(`覚えた語 +${g.topDelta}`);
  if (g.promoted === 0 && g.started > 0) bits.push(`はじめての語 ${g.started}`);
  if (bits.length === 0) return null;
  return bits.join('・');
}
