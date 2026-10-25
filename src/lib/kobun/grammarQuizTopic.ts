/**
 * 教材の語の参照単元（token.grammarRefId）から、文法道場でクイズを解ける単元を決める。
 * 従来の解説（GrammarPopover）と浮かぶ解説カード（WordCard）で共通に使う。
 */
/** 文法道場にクイズがある単元（grammarRefId の解決先がこの集合にあれば挑戦ボタンを出す） */
export const QUIZ_TOPICS = new Set<string>([
  "doushi-katsuyo", "doushi-yodan", "doushi-kami-ichidan", "doushi-shimo-nidan",
  "doushi-kahen", "doushi-sahen", "doushi-rahen",
  "keiyoshi-katsuyo", "keiyoshi-ku", "keiyoshi-shiku", "keiyoshi-gokan", "onbin",
  "jodoshi-jisei", "jodoshi-keri", "jodoshi-tsu", "jodoshi-nu", "jodoshi-tari", "jodoshi-ri",
  "jodoshi-mu", "jodoshi-suiryo", "jodoshi-beshi", "jodoshi-zu", "jodoshi-ru", "jodoshi-su",
  "jodoshi-ganbou", "jodoshi-dantei", "jodoshi-nari",
  "joshi-kaku", "joshi-setsuzoku", "joshi-fuku-kakari", "joshi-shujoshi", "kakari-musubi",
  "keigo", "keigo-sonkei", "keigo-kenjou", "keigo-teinei",
  "shikibetsu-ni", "shikibetsu-nu-ne", "shikibetsu-namu", "shikibetsu-ru-re",
  "shikibetsu-nari", "shikibetsu-shi", "vocab-kokon",
  "vocab-kokon-2", "vocab-shiten", "vocab-dan", "vocab-kinsetsu", "vocab-koou", "vocab-tagi",
]);

/** 教材タグの参照単元(grammarRefId)を、ドリルがあるクイズ単元へ解決する */
export function resolveQuizTopic(refId: string | undefined, meaning: string | undefined): string | null {
  if (!refId) return null;
  // ドリルの無いグループ参照を、対応する個別クイズ単元へ
  if (refId === "jodoshi-ukemi-shieki-sonkei") return meaning && meaning.includes("使役") ? "jodoshi-su" : "jodoshi-ru";
  // 否定系のドリルは「ず」（jodoshi-zu）だけ。「じ」は 2026-10-25 に推量系（jodoshi-suiryo）へ移した。否定系のまま残った打消推量・打消意志があってもクイズは出さない
  if (refId === "jodoshi-hitei") return meaning && /推量|意志/.test(meaning) ? null : "jodoshi-zu";
  return refId;
}

/** クイズを解ける単元。無ければ null */
export function grammarQuizTopicOf(refId: string | undefined, meaning: string | undefined): string | null {
  const t = resolveQuizTopic(refId, meaning);
  return t && QUIZ_TOPICS.has(t) ? t : null;
}
