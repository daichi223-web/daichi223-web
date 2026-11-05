/**
 * 文法道場の単元ページ：レベルごとの到達度のキーと、開いたときに選ぶレベル（2026-11-06。見直し ①）。
 * キーの形は今までと同じ（Lv1 は topicId、Lv2 以降は topicId@レベル）。記録の持ち方は変えていない。
 * DOM・通信に触れない（vitest の node 環境で検査する）。
 */

/** ✅ が付く到達度（％）。8問なら1ミスまで */
export const MASTERY_PCT = 85;

/** レベル別到達度の保存キー（Lv1 は従来どおり topicId、Lv2以降はサフィックス付き） */
export const levelKey = (topicId: string, level: number): string => (level === 1 ? topicId : `${topicId}@${level}`);

/**
 * 単元を開いたときに選んでおくレベル ＝ まだ ✅ が付いていない、いちばん下のレベル。
 * 毎回 Lv1 に戻ると、Lv1 を終えた生徒が自分で Lv2 を押し直すことになるため。
 * 全部 ✅ ならいちばん上。レベルが無い（ドリルが無い）単元は 1。
 */
export function initialLevel(
  levels: number[],
  progress: Record<string, { masteryPct: number } | undefined>,
  topicId: string,
): number {
  if (levels.length === 0) return 1;
  for (const L of levels) {
    if ((progress[levelKey(topicId, L)]?.masteryPct ?? 0) < MASTERY_PCT) return L;
  }
  return levels[levels.length - 1];
}
