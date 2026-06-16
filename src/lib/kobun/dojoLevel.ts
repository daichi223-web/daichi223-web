import type { TopicProgress } from "@/lib/kobun/types";

/**
 * 文法道場のレベル。grammar_topic_progress から導出する（専用テーブル不要）。
 *
 * XP の規則:
 * - 単元を定着（自己ベスト 85% 以上。8問抽出で7〜8問は1ミスまで、6問以下は実質全問正解）= 100xp
 * - 単元に挑戦（解いたが 85% 未満）     =  30xp
 * - 講義動画を視聴                       = +20xp
 * 100xp ごとに 1 レベル → 1 単元クリアでほぼ確実にレベルアップする。
 *
 * 到達度（masteryPct）は自己ベストで保存する運用（帯は剥奪しない）なので、
 * レベルは下がらない。
 */
export interface DojoLevel {
  level: number;
  xp: number;
  xpInto: number; // 現レベル内で稼いだ XP
  xpForNext: number; // 次のレベルに必要な XP（固定幅）
}

const XP_PER_LEVEL = 100;
const XP_MASTERED = 100;
const XP_ATTEMPTED = 30;
const XP_WATCHED = 20;

export function topicXp(p: TopicProgress): number {
  let xp = p.watched ? XP_WATCHED : 0;
  if (p.masteryPct >= 85) xp += XP_MASTERED;
  else if (p.drillTotal > 0) xp += XP_ATTEMPTED;
  return xp;
}

export function computeDojoLevel(progress: Record<string, TopicProgress>): DojoLevel {
  const xp = Object.values(progress).reduce((sum, p) => sum + topicXp(p), 0);
  return {
    level: 1 + Math.floor(xp / XP_PER_LEVEL),
    xp,
    xpInto: xp % XP_PER_LEVEL,
    xpForNext: XP_PER_LEVEL,
  };
}
