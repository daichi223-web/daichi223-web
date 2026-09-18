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

export type DrillStep = { drill: GrammarDrill; role: 'main' | 'support' | 'retry' };

/** 補助→元の問題の順。失敗した補助は再び下位へ進めるが、追加数は有限。 */
export function insertSupport(queue: DrillStep[], index: number, support: GrammarDrill): DrillStep[] {
  // 最初の本問は途中で誘導せずに解く。補助は本問がすべて終わってから。
  if (queue[index].role === 'main') {
    return [...queue, { drill: support, role: 'support' }, { drill: queue[index].drill, role: 'retry' }];
  }
  return [...queue.slice(0, index + 1), { drill: support, role: 'support' },
    { drill: queue[index].drill, role: 'retry' }, ...queue.slice(index + 1)];
}
