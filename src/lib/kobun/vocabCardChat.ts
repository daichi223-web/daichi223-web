/**
 * 単語カード（/word/:lemma）の会話の「聞けること」を決める純関数（2026-11-06）。
 *
 * 会話は決まった順に進めない。生徒が聞きたいことを選び、選んだ順に会話が下へ伸びる
 * （ユーザー指示「会話が順になるのではなく、選択肢的に選べるようにして」）。
 *   - 意味：どれからでも選べる
 *   - 理由・用例：その意味を見たあとに選べる（意味を見て一拍おいてから理由へ、は従来どおり）
 *   - 現代語の罠：いつでも選べる
 * 一度選んだものは選択肢から消える。DOM に触れない（描くのは pages/VocabCard.tsx）。
 */

export type CardAsk =
  | { kind: 'sense'; qid: string }
  | { kind: 'reason'; qid: string }
  | { kind: 'examples'; qid: string }
  | { kind: 'trap' };

export const askKey = (a: CardAsk): string => (a.kind === 'trap' ? 'trap' : `${a.kind}:${a.qid}`);

/** 選択肢を作るのに要る、意味1つぶんの情報 */
export type CardSenseInfo = {
  qid: string;
  label: string;
  /** 理由（核からなぜその意味になるか）があるか */
  hasReason: boolean;
  /** 最初の例文のほかに出せる用例の数 */
  moreExamples: number;
};

export type CardMenu = {
  /** まだ見ていない意味（単語帳の並び順） */
  senses: Array<{ qid: string; label: string }>;
  /** 見た意味について、まだ聞いていないこと（意味を見た順） */
  followUps: Array<{ qid: string; label: string; reason: boolean; examples: number }>;
  /** 現代語の罠をまだ聞いていない */
  trap: boolean;
};

export function buildCardMenu(senses: CardSenseInfo[], hasTrap: boolean, asked: CardAsk[]): CardMenu {
  const done = new Set(asked.map(askKey));
  const byQid = new Map(senses.map((s) => [s.qid, s]));
  const followUps: CardMenu['followUps'] = [];
  for (const a of asked) {
    if (a.kind !== 'sense') continue;
    const s = byQid.get(a.qid);
    if (!s) continue;
    const reason = s.hasReason && !done.has(`reason:${s.qid}`);
    const examples = s.moreExamples > 0 && !done.has(`examples:${s.qid}`) ? s.moreExamples : 0;
    if (reason || examples > 0) followUps.push({ qid: s.qid, label: s.label, reason, examples });
  }
  return {
    senses: senses.filter((s) => !done.has(`sense:${s.qid}`)).map((s) => ({ qid: s.qid, label: s.label })),
    followUps,
    trap: hasTrap && !done.has('trap'),
  };
}

/** 選択肢が1つも残っていないか */
export function isMenuEmpty(m: CardMenu): boolean {
  return m.senses.length === 0 && m.followUps.length === 0 && !m.trap;
}

/** 選んだものを会話に足す（同じものは二度足さない。理由・用例は、その意味を見ていなければ足さない） */
export function addAsk(asked: CardAsk[], a: CardAsk): CardAsk[] {
  const key = askKey(a);
  if (asked.some((p) => askKey(p) === key)) return asked;
  if ((a.kind === 'reason' || a.kind === 'examples') && !asked.some((p) => p.kind === 'sense' && p.qid === a.qid)) {
    return asked;
  }
  return [...asked, a];
}
