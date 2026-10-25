/**
 * 助詞・助動詞の意味ラベルを、カードの札に出す形にする（表示だけ。教材データは変えない。2026-10-25）。
 * 品詞分解の表は略して書くことがある（体修・順確・原因・順仮・念押 など）ので、略さない形にそろえる。
 */
const WHOLE: Record<string, string> = {
  体修: "連体修飾",
  用修: "連用修飾",
  順仮: "順接仮定",
  逆仮: "逆接仮定",
  強: "強意",
  呼: "呼びかけ",
  念押: "念押し",
  自已願望: "自己願望", // 正本の誤字
};

export function grammarMeaningLabel(meaning: string | null | undefined): string {
  const m = (meaning ?? "").trim();
  if (!m) return "";
  if (WHOLE[m]) return WHOLE[m];
  // 「順確・原因」「順確・偶然」「順確・恒常」→「順接確定（原因）」など
  const k = m.match(/^(順確|逆確)・(.+)$/);
  if (k) return `${k[1] === "順確" ? "順接確定" : "逆接確定"}（${k[2]}）`;
  return m;
}
