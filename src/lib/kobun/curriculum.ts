/** 文法道場の単元の教育的な並び順（道場ホームと学び直しで共通）。未掲載の id は末尾へ。 */
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
