// vocabIndex (hiragana lemma) に対応するトークン text/baseForm の表記揺れを吸収するエイリアスマップ。
//
// 想定するケース:
//   1. vocab key が「・」で複数形を併記している (例: "おはす・おはします") → bare "おはす" "おはします" 両方をエイリアス化
//   2. 漢字表記のトークン (例: "言ふ" "知ら" "申す") を hiragana lemma にマップ
//   3. 派生形 (他動詞・受身・使役) を派生元の vocabIndex 見出しに対応 (例: おどろかす → おどろく)
//   4. 連用形・連体形・形容動詞語幹など、baseForm 取得失敗ケースの個別対応
//
// 元の vocabIndex.json は build-vocab-bundle.py で再生成されるため、
// 表記揺れマップはこのファイルに code としてまとめておく (JSON を直接いじると上書きされる)。

import bundledVocabIndex from '@/data/vocabIndex.json';

const vocabKeys = new Set(Object.keys(bundledVocabIndex as Record<string, unknown>));

// === 派生形 → 派生元 lemma ===
const DERIVATIVE_TO_LEMMA: Record<string, string> = {
  'おどろかす': 'おどろく', // 他動詞「目覚めさせる」← 自動詞「目を覚ます」
};

// === 連用形・連体形などで baseForm が取れていないケース ===
const INFLECTION_ALIAS: Record<string, string> = {
  'はべる': 'はべり',
  'あはれ': 'あはれなり',
  'おぼし': 'おぼす・おぼしめす',
  'おぼしめし': 'おぼす・おぼしめす',
};

// === 漢字表記 → hiragana lemma ===
// vocabIndex に存在する hiragana lemma に対し、テキストに頻出する漢字活用形を列挙。
const KANJI_VARIANTS: Record<string, string[]> = {
  'あく':    ['飽く', '飽き', '飽か', '飽け'],
  'あふ':    ['逢ふ', '会ふ', '合ふ', '逢ひ', '逢は', '逢へ', '会ひ', '合ひ'],
  'あり':    ['有り', '有る', '有れ'],
  'ありく':  ['歩く', '歩き', '歩か', '歩け'],
  'いづ':    ['出づ', '出で', '出る'],
  'いふ':    ['言ふ', '言ひ', '言は', '言へ', '云ふ', '云ひ'],
  'いぬ':    ['寝', '寝ぬ', '寝な', '寝に'],
  'うす':    ['失す', '失せ'],
  'うつる':  ['移る', '移り', '移ら', '移れ', '写る'],
  'うつろふ': ['移ろふ', '移ろひ'],
  'おどろく': ['驚く', '驚き', '驚か', '驚け'],
  'おぼゆ':  ['覚ゆ', '覚え', '覚ゆる'],
  'おほす':  ['仰す', '仰せ', '仰せらる'],
  'おもひやる': ['思ひやる', '思ひやり'],
  'かく':    ['書く', '書き', '書か', '書け', '描く'],
  'かしづく': ['傅く', '傅き', '傅か'],
  'かたみ':  ['形見'],
  'かなし':  ['悲し', '哀し'],
  'かねて':  ['兼ねて'],
  'きこゆ':  ['聞こゆ', '聞こえ', '聞こゆる'],
  'くだる':  ['下る', '下り', '下ら', '下れ'],
  'けしき':  ['気色'],
  'こころ':  ['心'],
  'こころざし': ['志', '御志'],
  'ことなり': ['異なり', '異なる'],
  'ことわり': ['理', '道理'],
  'しる':    ['知る', '知ら', '知り', '知れ', '知ろ'],
  'そうす':  ['奏す', '奏し'],
  'たつ':    ['立つ', '立ち', '立て', '立た'],
  'たてまつる': ['奉る', '奉り', '奉ら', '奉れ'],
  'たのし':  ['楽し', '楽しき', '楽しく'],
  'たのむ':  ['頼む', '頼み', '頼ま', '頼め'],
  'たまふ':  ['給ふ', '給ひ', '給は', '給へ', '賜ふ', '賜ひ'],
  'たまはる': ['給はる', '賜る', '賜はり'],
  'ちぎり':  ['契り'],
  'とく':    ['解く', '解き', '説く', '疾く', '早く'],
  'とぶらふ': ['訪ふ', '訪ひ'],
  'ながむ':  ['眺む', '眺め', '詠む', '詠め', '詠み'],
  'なつかし': ['懐かし'],
  'にほふ':  ['匂ふ', '匂ひ', '匂は'],
  'ひく':    ['引く', '引き', '引か', '引け'],
  'ふす':    ['伏す', '伏し', '臥す', '臥し'],
  'まうく':  ['設く', '設け', '設くる'],
  'まうす':  ['申す', '申し', '申さ', '申せ'],
  'まうづ':  ['詣づ', '詣で'],
  'まかる':  ['罷る', '罷り', '罷ら'],
  'まどふ':  ['惑ふ', '惑ひ', '惑は'],
  'まもる':  ['守る', '守り', '守ら', '守れ'],
  'みゆ':    ['見ゆ', '見え', '見ゆる'],
  'めす':    ['召す', '召し', '召さ', '召せ'],
  'めづ':    ['愛づ', '愛で', '愛づる'],
  'めでたし': ['愛でたし', '愛でたく'],
  'ものす':  ['物す', '物し'],
  'やすらふ': ['安らふ', '安らひ'],
  'やつす':  ['窶す', '窶し'],
  'ゆゑ':    ['故'],
  'わたる':  ['渡る', '渡り', '渡ら', '渡れ'],
  'ゐる':    ['居る', '居', '居り', '居れ'],
  'をかし':  ['可笑し'],
  'あさまし': ['浅まし', '浅ましく', '浅ましき'],
  'あやし':  ['怪し', '怪しき', '怪しく', '賤し'],
  'うつくし': ['美し', '美しき', '美しく'],
  'うるはし': ['麗し', '麗しき', '麗しく'],
  'おもしろし': ['面白し', '面白く'],
  'はかなし': ['儚し', '儚く'],
  'はづかし': ['恥づかし', '恥づかしき', '恥づかしく'],
  'よし':    ['由'],
  'よろづ':  ['万'],
  'まゐる':  ['参る', '参り', '参ら', '参れ'],
  'まゐらす': ['参らす', '参らせ'],
  'おぼす・おぼしめす': ['思す', '思し', '思さ', '思せ', '思ほす', '思ほし', '思ほさ'],
  'こころばへ': ['心ばへ'],
  'こころにくし': ['心にくし', '心憎し'],
  'こころなし': ['心なし'],
};

// === 解決テーブルを構築 ===
// alias key → vocabIndex に実在する正規 key
const ALIAS_TO_VOCAB_KEY: Record<string, string> = {};

// 1. 「・」分割エイリアス (例: "のたまふ・のたまはす" → "のたまふ" / "のたまはす" 両方が link)
for (const key of vocabKeys) {
  if (!key.includes('・')) continue;
  for (const part of key.split('・')) {
    const p = part.trim();
    if (!p || p.includes('～')) continue; // 「ゆめゆめ～打消・禁止」等を除外
    if (vocabKeys.has(p)) continue;
    if (!ALIAS_TO_VOCAB_KEY[p]) ALIAS_TO_VOCAB_KEY[p] = key;
  }
}

// 2. 派生形・連用形などの個別 alias
for (const [from, to] of Object.entries(DERIVATIVE_TO_LEMMA)) {
  if (vocabKeys.has(to) && !ALIAS_TO_VOCAB_KEY[from]) ALIAS_TO_VOCAB_KEY[from] = to;
}
for (const [from, to] of Object.entries(INFLECTION_ALIAS)) {
  if (vocabKeys.has(to) && !ALIAS_TO_VOCAB_KEY[from]) ALIAS_TO_VOCAB_KEY[from] = to;
}

// 3. 漢字表記 → hiragana lemma
for (const [lemma, variants] of Object.entries(KANJI_VARIANTS)) {
  if (!vocabKeys.has(lemma)) continue;
  for (const v of variants) {
    if (vocabKeys.has(v)) continue;
    if (!ALIAS_TO_VOCAB_KEY[v]) ALIAS_TO_VOCAB_KEY[v] = lemma;
  }
}

/**
 * トークンの表層形 (text) と基本形 (baseForm) から、対応する vocabIndex の正規 key を解決する。
 * - vocabIndex に直接ある場合はそれを返す
 * - エイリアス経由で解決できる場合はその先の key を返す
 * - 該当なしなら null
 */
export function resolveVocabKey(text: string, baseForm: string | undefined | null): string | null {
  const base = (baseForm ?? '').trim();
  if (base && vocabKeys.has(base)) return base;
  const t = (text ?? '').trim().replace(/^[、。「」『』（）\s]+|[、。「」『』（）\s]+$/g, '');
  if (t && vocabKeys.has(t)) return t;
  if (base && ALIAS_TO_VOCAB_KEY[base]) return ALIAS_TO_VOCAB_KEY[base];
  if (t && ALIAS_TO_VOCAB_KEY[t]) return ALIAS_TO_VOCAB_KEY[t];
  return null;
}

// テスト/デバッグ用 export
export { ALIAS_TO_VOCAB_KEY };
