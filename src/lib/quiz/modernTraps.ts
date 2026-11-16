/**
 * 現代語の罠（古今異義語）。見出し語 → 罠の意味の文字列。
 * 正本は data/modern_traps.json（API の getChoices も同じファイルを読む）。ブラウザには同梱する（約6KB）。
 */
import raw from '../../../data/modern_traps.json';

const TRAPS: Record<string, unknown> = raw as Record<string, unknown>;

/** その見出し語の現代語の罠（無ければ空）。`_comment` などの配列でない値は罠として扱わない */
export function trapsOf(lemma: string): string[] {
  const v = TRAPS[lemma];
  return Array.isArray(v) ? (v as string[]) : [];
}
