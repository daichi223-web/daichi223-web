import type { PortraitTone } from './portraitTone';

// 単語クイズの答え合わせ（LINE 風）で話す先生。史実の人物像に寄せた口調で話す（台詞の本体は teacherLines.ts）。
// 絵は public/teachers/<id>-<tone>.webp（200px 正方形。画風は位階の肖像と同じ sharp / yuru / pop）。
// 4種類目「みやび」<id>-anime.webp（teacherImage の art）は10人全員ぶんある（男性4人は 2026-11-13 夜に Codex の依頼2 で追加）。
// 台詞の決まり（変数名・状況・字数）は F:\A2A\_work\kobun-chat-feedback\BRIEF-lines.md。

// 先生の口調（キャラの台詞）を答え合わせに出すか。false の間は中立の文（teacherLines.ts の NEUTRAL_LINES）で出し、
// 設定欄の人物紹介も出さない。台詞を原典で照合してから true にする（2026-11-02 ユーザー指示「まずコメントなし版をデプロイ」）
// 2026-11-13 ユーザー指示「今あるもので実装を始めたい」で true にした（10人の台詞・ホームのあいさつが出る。台詞は AI 作成・教員未確認、
// Codex の読み直し＝共有ファイルの依頼4 は未着手）。戻すときは false にするだけ（中立の文に戻り、ホームのあいさつも消える）。
export const TEACHER_VOICE_ENABLED = true;

export type TeacherId = 'sei' | 'murasaki' | 'michizane' | 'tsurayuki' | 'teika' | 'komachi' | 'izumi' | 'koshikibu' | 'ukyo' | 'narihira';

export const TEACHER_IDS: readonly TeacherId[] = ['sei', 'murasaki', 'michizane', 'tsurayuki', 'teika', 'komachi', 'izumi', 'koshikibu', 'ukyo', 'narihira'];

export type TeacherMeta = {
  id: TeacherId;
  name: string;      // 清少納言
  kana: string;      // せいしょうなごん
  title: string;     // 『枕草子』の作者
  oneLiner: string;  // 選択画面の一言紹介（25字以内）
  profile: string;   // 選択中の先生の人物像（設定欄に出す2〜3文。史実の範囲内、70字以内）
};

// 名前・かな・肩書・一言は台詞（teacherLines.ts）と同じ執筆→校閲を通した本データ（2026-11-02）。肩書は人物像（BRIEF-lines.md）の範囲内。
export const TEACHERS: Record<TeacherId, TeacherMeta> = {
  sei: {
    id: 'sei',
    name: '清少納言',
    kana: 'せいしょうなごん',
    title: '『枕草子』の作者',
    oneLiner: '正解には「いとをかし」。歯切れよく断じる。',
    profile: '中宮定子に仕え『枕草子』を書いた。よいものは「をかし」と言い切るが、新参のころは気後れもした人。',
  },
  murasaki: {
    id: 'murasaki',
    name: '紫式部',
    kana: 'むらさきしきぶ',
    title: '『源氏物語』の作者',
    oneLiner: '控えめな丁寧語で、答え方をそっと見ている先生',
    profile: '中宮彰子に仕え『源氏物語』を書いた。学問をひけらかさず、合っている所と足りない所を分けて静かに言う。',
  },
  michizane: {
    id: 'michizane',
    name: '菅原道真',
    kana: 'すがわらのみちざね',
    title: '『菅家文草』の漢詩人、のちの学問の神',
    oneLiner: '抜き書きを勧める、採点の公平な学者',
    profile: '文章博士として学生を教え、「学問の道は抜き書きが第一」と書いた。右大臣から大宰府へ。死後、天神とされる。',
  },
  tsurayuki: {
    id: 'tsurayuki',
    name: '紀貫之',
    kana: 'きのつらゆき',
    title: '『古今和歌集』の撰者',
    oneLiner: '心と言葉のつり合いを見る、確かな批評家',
    profile: '仮名序に「人の心を種として」と書き、六歌仙をずばり評した。口調はやわらかいが、評は正確。',
  },
  teika: {
    id: 'teika',
    name: '藤原定家',
    kana: 'ふじわらのていか',
    title: '『新古今和歌集』の撰者の一人',
    oneLiner: '理由を言って判じる、辛口の判者',
    profile: '歌合の判者をつとめ、古典を何度も書き写して直した。辛口だが、正しい答えは勝ちと認め、直せば良くなると言う。',
  },
  // 2026-11-12 追加（ユーザー指示「小町だけ足す」）
  komachi: {
    id: 'komachi',
    name: '小野小町',
    kana: 'おののこまち',
    title: '六歌仙の一人・『古今和歌集』の歌人',
    oneLiner: '言葉の響きと余韻を、静かに味わう先生',
    profile: '六歌仙でただ一人の女性。生没年も出自も未詳。一語に二つの意味を重ねた「花の色は」の歌で知られる。',
  },
  // 2026-11-12 追加（ユーザー指示「今いるキャラはそのまま」で和泉式部・小式部内侍・建礼門院右京大夫、続けて「在原業平も入れる」）
  izumi: {
    id: 'izumi',
    name: '和泉式部',
    kana: 'いずみしきぶ',
    title: '『和泉式部日記』で知られる恋の歌人',
    oneLiner: '正解を自分のことのように喜ぶ、情熱の人',
    profile: '中宮彰子に仕えた歌人。紫式部は「口にまかせた歌にも必ず目にとまる一節がある」と評した。',
  },
  koshikibu: {
    id: 'koshikibu',
    name: '小式部内侍',
    kana: 'こしきぶのないし',
    title: '和泉式部の娘・「大江山」の歌の作者',
    oneLiner: '一緒に挑む先輩。切り返しの速さが持ち味',
    profile: '和泉式部の娘。母の代作かとからかわれ「大江山」の歌で返した、という説話が伝わる。年の近い先輩。',
  },
  ukyo: {
    id: 'ukyo',
    name: '建礼門院右京大夫',
    kana: 'けんれいもんいんうきょうのだいぶ',
    title: '『建礼門院右京大夫集』の作者',
    oneLiner: '思い出と言葉を大切にする、静かな伴走者',
    profile: '建礼門院徳子に仕え、思い出を歌集に書きとめた。定家に名を問われ、昔の名を選んだ。星の夜を詠んだ歌も。',
  },
  narihira: {
    id: 'narihira',
    name: '在原業平',
    kana: 'ありわらのなりひら',
    title: '六歌仙の一人・『伊勢物語』の主人公のモデル',
    oneLiner: '心が先に立つ、型にはまらない歌の人',
    profile: '六歌仙の一人。仮名序に「その心余りて詞たらず」、国史に「漢学は乏しいが和歌が上手」と記された。',
  },
};

// 先生の絵の「みやび」（2026-11-13、Codex 作。背景は透明）。ファイル名は作業中の仮の名のまま <id>-anime.webp。
// 絵の雰囲気（PortraitTone）の miyabi を選ぶとこの絵になる（同日、先生の絵だけの別設定をやめて一本化した）。
// 小式部内侍の絵は、提供時は清少納言として描かれたもの。明るい笑顔が清少納言の型（強気なツンデレ）と合わず、
// 小式部内侍（元気な先輩）に回した（2026-11-13 ユーザー承認）。清少納言は同日、型に合わせて描き直した絵が届いて入れた。
/** みやびの絵がある先生（public/teachers/<id>-anime.webp）。無い先生は しっとり（sharp）の絵で出す */
export const ANIME_TEACHER_IDS: readonly TeacherId[] = ['sei', 'murasaki', 'michizane', 'tsurayuki', 'teika', 'komachi', 'izumi', 'koshikibu', 'ukyo', 'narihira'];

/** 先生の絵のパス。みやびは <id>-anime.webp、ほかは <id>-<tone>.webp */
export function teacherImage(id: TeacherId, tone: PortraitTone): string {
  if (tone === 'miyabi') return ANIME_TEACHER_IDS.includes(id) ? `/teachers/${id}-anime.webp` : `/teachers/${id}-sharp.webp`;
  return `/teachers/${id}-${tone}.webp`;
}

export function isTeacherId(v: unknown): v is TeacherId {
  return typeof v === 'string' && (TEACHER_IDS as readonly string[]).includes(v);
}

/** 状況ごとの台詞（variant の配列）。鍵の意味は BRIEF-lines.md の「出力の形」と同じ */
export type TeacherLines = {
  correct: string[];     // 正解
  wrong: string[];       // 不正解（{正解} を含む）
  trap: string[];        // 現代語の罠（{現代語} と {正解}）
  nearMiss: string[];    // 記述で別の正しい意味を書いた（{書いた意味} と {正解}）
  blank: string[];       // 無回答（{正解}）
  pending: string[];     // 機械で判定できず自己判定を頼む（{正解}）
  selfRight: string[];   // 自己判定 ○ のあと
  selfWrong: string[];   // 自己判定 × のあと
  coreLead: string[];    // 核イメージの前置き
  exampleLead: string[]; // 例文と訳の前置き
  trapLead: string[];    // 罠の注意の前置き
};

export const TEACHER_LINE_KEYS: readonly (keyof TeacherLines)[] = [
  'correct', 'wrong', 'trap', 'nearMiss', 'blank', 'pending',
  'selfRight', 'selfWrong', 'coreLead', 'exampleLead', 'trapLead',
];

/** 台詞に差し込む変数。鍵は台詞の {語}{正解}{現代語}{書いた意味} と同じ綴り */
export type TeacherVars = { 語: string; 正解: string; 現代語?: string; 書いた意味?: string };

export const TEACHER_VAR_NAMES: readonly string[] = ['語', '正解', '現代語', '書いた意味'];

const VAR_PATTERN = /\{([^{}]*)\}/g;

/** {語}{正解}{現代語}{書いた意味} を置き換える。未定義の変数（綴りちがいも）は空文字にして { } を残さない */
export function fillTemplate(tpl: string, vars: TeacherVars): string {
  const table = vars as Record<string, string | undefined>;
  return tpl.replace(VAR_PATTERN, (_m, key: string) => table[key.trim()] ?? '');
}

// FNV-1a（32bit）。同じ seed なら同じ値になる軽いハッシュ
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// 同じ台詞が2回続かないようにする記憶（2026-11-13 ユーザー指示「二連続で同じコメントにならないように」）。
// - 台詞の配列ごとに、前回選んだ番号を覚える。次に別の seed で選ぶとき、ハッシュの番号が前回と同じなら1つずらす。
// - 同じ seed（同じ問題の同じ場面）はいつも同じ答えを返す（画面の描き直しで台詞が変わらないように、seed ごとに覚える）。
// 記憶はページを開いている間だけ（端末にも DB にも残さない）。
const lastPicked = new WeakMap<readonly string[], number>();
const pickedBySeed = new WeakMap<readonly string[], Map<string, number>>();
const MAX_SEEDS_PER_LIST = 500;

/**
 * variant を1つ選ぶ。基本は seed のハッシュ % 個数で、同じ seed なら同じ文。
 * ただし同じ配列から直前に選んだ文と同じになるときは次の文にする（2つ以上あるとき）。空配列なら ''。
 */
export function pickVariant(variants: readonly string[], seed: string): string {
  const n = variants.length;
  if (n === 0) return '';
  let bySeed = pickedBySeed.get(variants);
  const known = bySeed?.get(seed);
  if (known !== undefined) return variants[known] ?? '';
  let idx = hashSeed(seed) % n;
  if (n > 1 && lastPicked.get(variants) === idx) idx = (idx + 1) % n;
  if (!bySeed) {
    bySeed = new Map();
    pickedBySeed.set(variants, bySeed);
  }
  if (bySeed.size >= MAX_SEEDS_PER_LIST) bySeed.clear();
  bySeed.set(seed, idx);
  lastPicked.set(variants, idx);
  return variants[idx] ?? '';
}
