import type { GrammarDrill, GrammarDrillKind } from './types';
import type { ItemStat } from '../quizSelector';

export const SUPPORT_REASONS = {
  auto: 'どこで迷ったか分からない',
  connection: '接続が分からない',
  form: '活用・形が分からない',
  meaning: '意味・文脈で迷った',
} as const;
export type SupportReason = keyof typeof SUPPORT_REASONS;
export const SUPPORT_LIMIT = 6;
export const skillLabel: Record<GrammarDrillKind, string> = {
  'katsuyo-type': '活用の種類', 'katsuyo-fill': '活用形', 'table-complete': '活用表',
  setsuzoku: '接続', imi: '意味・文脈', shikibetsu: '識別',
};
const level = (d: GrammarDrill) => Math.min(5, Math.floor((d.sort ?? 0) / 100) + 1);

/** 原因を断定せず、同じ単元の既存問題で一段手前の知識を確認する。 */
export function chooseSupport(
  failed: GrammarDrill,
  bank: GrammarDrill[],
  used: Set<string>,
  reason: SupportReason = 'auto',
  stats: Record<string, ItemStat> = {},
): GrammarDrill | null {
  const kinds: GrammarDrillKind[] = reason === 'connection' ? ['setsuzoku']
    : reason === 'form' ? ['katsuyo-type', 'katsuyo-fill', 'table-complete']
    : reason === 'meaning' ? ['imi', 'shikibetsu']
    : failed.kind === 'imi' || failed.kind === 'shikibetsu'
      ? ['setsuzoku', 'katsuyo-fill', failed.kind]
      : failed.kind === 'table-complete' || failed.kind === 'katsuyo-fill'
        ? ['katsuyo-type', 'katsuyo-fill'] : [failed.kind];
  const candidates = bank.filter(d => d.topicId === failed.topicId && d.id !== failed.id
    && !used.has(d.id) && kinds.includes(d.kind) && level(d) < level(failed)
    && (d.choices?.length ?? 0) > 1);
  candidates.sort((a, b) => {
    // 近い下位レベルを優先。同じ段階なら履歴上の誤答率が高い問題から確認。
    const error = (d: GrammarDrill) => {
      const s = stats[d.id];
      return s ? s.incorrect / Math.max(1, s.correct + s.incorrect) : .5;
    };
    return level(b) - level(a) || error(b) - error(a) || kinds.indexOf(a.kind) - kinds.indexOf(b.kind)
      || a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}

/** plain＝手前の問題なしで足した「もう一度」（2026-11-06）。画面の文を変えるためだけの印 */
export type DrillStep = { drill: GrammarDrill; role: 'main' | 'support' | 'retry'; plain?: boolean };

/** 補助→元の問題の順。失敗した補助は再び下位へ進めるが、追加数は有限。 */
export function insertSupport(queue: DrillStep[], index: number, support: GrammarDrill): DrillStep[] {
  // 最初の本問は途中で誘導せずに解く。補助は本問がすべて終わってから。
  if (queue[index].role === 'main') {
    return [...queue, { drill: support, role: 'support' }, { drill: queue[index].drill, role: 'retry' }];
  }
  return [...queue.slice(0, index + 1), { drill: support, role: 'support' },
    { drill: queue[index].drill, role: 'retry' }, ...queue.slice(index + 1)];
}

// ---------------------------------------------------------------------------
// 2026-11-06 文法道場の見直し ④⑩（手前の問題が無いときの「もう一度」・8問に足りないときの補い・ボタンの文字）

/** 手前の問題になりうるものが1つでもあるか（迷った所の種類は問わない）。「どこで迷いましたか？」を出すかどうかに使う */
export function hasSupportCandidate(failed: GrammarDrill, bank: GrammarDrill[], used: Set<string>): boolean {
  return bank.some(d => d.topicId === failed.topicId && d.id !== failed.id && !used.has(d.id)
    && level(d) < level(failed) && (d.choices?.length ?? 0) > 1);
}

/** 間違えたあとに足すもの。support＝一段手前→元の問題、retry＝手前なしで元の問題だけ最後にもう一度 */
export type FollowUp = { type: 'support'; drill: GrammarDrill } | { type: 'retry' };

/**
 * 間違えた問題（queue[index]）のあとに何を足すか。
 * - 手前の問題があれば今までどおり「手前→再挑戦」（2問ぶん）
 * - 手前が無い本問は、最後に1回だけ「もう一度」（1問ぶん）。Lv1 には下のレベルが無く、やり直す機会が無かったため
 * - 再挑戦を間違えても、もう足さない。足せる合計は今までと同じ SUPPORT_LIMIT
 */
export function planFollowUp(
  queue: DrillStep[],
  index: number,
  bank: GrammarDrill[],
  reason: SupportReason = 'auto',
  stats: Record<string, ItemStat> = {},
): FollowUp | null {
  const step = queue[index];
  if (!step || step.role === 'retry') return null;
  const added = queue.filter(s => s.role !== 'main').length;
  if (added + 2 <= SUPPORT_LIMIT) {
    const support = chooseSupport(step.drill, bank, new Set(queue.map(s => s.drill.id)), reason, stats);
    if (support) return { type: 'support', drill: support };
  }
  if (step.role === 'main' && added + 1 <= SUPPORT_LIMIT) return { type: 'retry' };
  return null;
}

/** planFollowUp の結果を並びに入れる。手前なしの「もう一度」はいちばん後ろ（plain の印つき）。入力は破壊しない */
export function applyFollowUp(queue: DrillStep[], index: number, followUp: FollowUp | null): DrillStep[] {
  if (!followUp) return queue;
  if (followUp.type === 'support') return insertSupport(queue, index, followUp.drill);
  return [...queue, { drill: queue[index].drill, role: 'retry', plain: true }];
}

/**
 * 「つぎへ」のボタンの文字。次に出る問題の役から決める。
 * 最後の本問のあとは、前の問題の手前が先に並んでいることがあるので「一段手前」とは書かず「確認の問題へ」にする
 */
export function nextStepLabel(step: DrillStep, next: DrillStep | undefined): string {
  if (!next) return 'けっか';
  if (step.role === 'main' && next.role === 'support') return '確認の問題へ →';
  if (step.role === 'main' && next.role === 'retry') return 'もう一度の問題へ →';
  if (step.role === 'support' && next.role === 'support') return '一段手前を確認する →';
  return 'つぎへ';
}

/**
 * そのレベルの問題が size 問に足りないとき、足りない分を1つ上のレベルの易しい順（sort の小さい順）から足す。
 * Lv1 が2〜8問しか無い単元では、毎回まったく同じ顔ぶれになっていたため。
 * 「1つ上」＝その単元にある、すぐ上のレベル。上が無ければそのまま。足した問題は後ろに置く（元のレベルを先に解く）
 */
export function fillFromUpperLevel(picked: GrammarDrill[], bank: GrammarDrill[], lv: number, size: number): GrammarDrill[] {
  if (picked.length >= size) return picked;
  const upper = bank.map(level).filter(l => l > lv).sort((a, b) => a - b)[0];
  if (upper === undefined) return picked;
  const have = new Set(picked.map(d => d.id));
  const extra = bank.filter(d => level(d) === upper && !have.has(d.id) && (d.choices?.length ?? 0) > 1)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));
  return [...picked, ...extra.slice(0, size - picked.length)];
}
