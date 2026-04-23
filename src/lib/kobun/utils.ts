/** 文IDを「第○文」形式に変換 */
export function sentenceLabel(sentenceId: string): string {
  const num = parseInt(sentenceId.replace("s", ""), 10);
  const kanji = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (num >= 1 && num <= 10) return `第${kanji[num - 1]}文`;
  return `第${num}文`;
}
