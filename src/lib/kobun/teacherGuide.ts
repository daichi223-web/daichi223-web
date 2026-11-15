// 先生のガイド（2026-11-15 ユーザー指示「先生がガイドしてくれるといいかも」「文法道場も」。ユーザー選択「要所で一言」）。
// 学び始め（はじめ・段の切り替わり・結果）と文法道場（ホームの上・単元ページの上）で、選んでいる先生が1〜3文で道案内する。
// 文は中立の言い方（先生ごとの口調にはしない）。1文＝1つの吹き出し（読解テストの解説と同じ）。
// 出すかどうかは呼ぶ側が TEACHER_VOICE_ENABLED で決める（ホームのあいさつと同じ切り替え）。

/** 学び始めのはじめ */
export function manabiIntroGuide(): string[] {
  return ["どこから始めればいいか、一緒に確かめよう。", "下の段から2問ずつ聞くね。まちがえたところが、あなたの出発点。"];
}

/** はじめの確認で、段の最初の問いの上に出す一言 */
export function manabiStageGuide(stage: number): string[] {
  const lines: Record<number, string> = {
    0: "まずは文法の言葉から。",
    1: "次は用言。動詞と形容詞を確かめるよ。",
    2: "次は助動詞。",
    3: "次は助詞。",
    4: "最後は敬語。",
  };
  return lines[stage] ? [lines[stage]] : [];
}

/**
 * はじめの確認の結果。
 * passedNames＝できた段の短い名前（段0から順）、startName＝出発点の段の短い名前、startTitle＝出発点の単元名。
 */
export function manabiResultGuide(r: { passedNames: string[]; startStage: number | null; startName: string | null; startTitle: string | null }): string[] {
  if (r.startStage === null) return ["全部できたね。", "文法道場で、気になる単元から進もう。"];
  if (r.startStage === 0) return ["まずは文法の言葉に慣れよう。", "答えてから説明を読めば大丈夫。"];
  const out: string[] = [];
  if (r.passedNames.length > 0) out.push(`${r.passedNames.join("・")}はできていたよ。`);
  out.push(`${r.startName}でつまずいたね。`);
  if (r.startTitle) out.push(`まず${q(r.startTitle)}から始めよう。`, "終わったら次の単元へ進もう。");
  return out;
}

/**
 * 文法道場ホームの上の一言。カードの並び（つづきから→復習→ここから／どこから始める？）と同じことを言う。
 * dueCount＝今日の復習の数、lastTitle＝つづきの単元、startTitle＝学び始めの出発点（クリア前だけ）、beginner＝まだどの単元も解いていない。
 */
export function dojoHomeGuide(g: { dueCount: number; lastTitle: string | null; startTitle: string | null; beginner: boolean }): string[] {
  const out: string[] = [];
  if (g.dueCount > 0) out.push(`今日は復習が${g.dueCount}問。`);
  const after = out.length > 0 ? "そのあと" : "";
  if (g.lastTitle) out.push(`${after}${q(g.lastTitle)}のつづきをやろう。`);
  else if (g.startTitle) out.push(`${after}出発点の${q(g.startTitle)}から始めよう。`);
  else if (out.length > 0) out.push("まずはそこから。");
  else if (g.beginner) out.push("どこから始めるか迷ったら、「どこから始める？」で確かめよう。");
  else out.push("気になる単元を選んで、ドリルで確かめよう。");
  return out;
}

/**
 * 単元ページの上の一言。単元の要約（summary）と、どのレベルから始めるか。
 * levelCount＝この単元のレベルの数、startLabel＝今選んでいるレベルの名前、allMastered＝全部のレベルに ✅、count＝1回の問題数。
 */
export function dojoTopicGuide(t: { summary: string | null; levelCount: number; startLabel: string; allMastered: boolean; count: number }): string[] {
  const out: string[] = [];
  if (t.summary) out.push(...splitGuide(t.summary));
  if (t.levelCount <= 1) out.push(`${t.count}問で確かめよう。`);
  else if (t.allMastered) out.push("全部のレベルに ✅ がついたね。上のレベルで腕だめししよう。");
  else out.push(`「${t.startLabel}」から始めよう。✅ がついたら次のレベルへ。`);
  return out;
}

/** 「。」で区切って1文ずつに（要約が2文のとき吹き出しを分ける） */
function splitGuide(text: string): string[] {
  return (text.match(/[^。]+。?/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** 単元名をかぎかっこで囲む。名前にかぎかっこが入っているとき（助動詞「けり」）は囲まない */
function q(title: string): string {
  return title.includes("「") ? title : `「${title}」`;
}
