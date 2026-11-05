/** 文法道場の単元の教育的な並び順（道場ホームと学び始めで共通）。未掲載の id は末尾へ。 */
export const CURRICULUM = [
  "doushi-katsuyo", "doushi-yodan", "doushi-kami-ichidan", "doushi-shimo-nidan",
  "doushi-kahen", "doushi-sahen", "doushi-rahen",
  "keiyoshi-katsuyo", "keiyoshi-ku", "keiyoshi-shiku", "keiyoshi-gokan", "onbin",
  "jodoshi-toha",
  "jodoshi-jisei", "jodoshi-keri", "jodoshi-tsu", "jodoshi-nu", "jodoshi-tari", "jodoshi-ri",
  "jodoshi-mu", "jodoshi-suiryo", "jodoshi-beshi", "jodoshi-zu",
  "jodoshi-ru", "jodoshi-su", "jodoshi-ganbou", "jodoshi-dantei", "jodoshi-nari",
  "joshi-kaku", "joshi-setsuzoku", "joshi-fuku-kakari", "joshi-shujoshi", "kakari-musubi",
  "keigo", "keigo-sonkei", "keigo-kenjou", "keigo-teinei",
  "shikibetsu", "shikibetsu-ni", "shikibetsu-nu-ne", "shikibetsu-namu",
  "shikibetsu-ru-re", "shikibetsu-nari", "shikibetsu-shi",
  "vocab-kokon", "vocab-kokon-2", "vocab-shiten", "vocab-dan", "vocab-kinsetsu", "vocab-koou", "vocab-tagi",
];

export const orderIndex = (id: string) => {
  const i = CURRICULUM.indexOf(id);
  return i < 0 ? 999 : i;
};

/**
 * 並び順で「今の単元の次」を決める（2026-11-06。文法道場の見直し ①）。結果画面の「次の単元：〇〇 ▸」に使う。
 * - 進めるのは、本番にドリルがある単元（available）だけ。間にドリルの無い単元があれば飛ばして、その先の最初の単元へ
 * - 単語の単元（vocab-*）へは進めない（単語道場の持ち場。文法の最後の単元の次は「無し」）
 * - 並び順に無い単元・最後の単元は null
 */
export function nextTopicId(current: string, available: Iterable<string>): string | null {
  const i = CURRICULUM.indexOf(current);
  if (i < 0) return null;
  const has = new Set(available);
  for (let k = i + 1; k < CURRICULUM.length; k++) {
    const id = CURRICULUM[k];
    if (id.startsWith("vocab-")) continue;
    if (has.has(id)) return id;
  }
  return null;
}
