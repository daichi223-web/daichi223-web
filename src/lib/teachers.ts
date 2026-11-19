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

export type BaseTeacherId = 'sei' | 'murasaki' | 'michizane' | 'tsurayuki' | 'teika' | 'komachi' | 'izumi' | 'koshikibu' | 'ukyo' | 'narihira';
// 教材の先生（2026-11-17 ユーザー指示）。その教材の読解テストに出て、クリアすると選べるようになる（workTeachers.ts）。
export type GuestTeacherId = 'kaguya' | 'yoshihide' | 'kenko' | 'takasuenomusume' | 'nukata' | 'yotsugi' | 'kazan' | 'taketorinookina' | 'mikado' | 'ishitsukuri' | 'kuramochi' | 'abenomiushi' | 'otomonomiyuki' | 'isonokami';
export type TeacherId = BaseTeacherId | GuestTeacherId;

/** はじめから選べる先生（設定欄に並ぶ順） */
export const TEACHER_IDS: readonly BaseTeacherId[] = ['sei', 'murasaki', 'michizane', 'tsurayuki', 'teika', 'komachi', 'izumi', 'koshikibu', 'ukyo', 'narihira'];
/** 教材をクリアすると手に入る先生 */
export const GUEST_TEACHER_IDS: readonly GuestTeacherId[] = ['kaguya', 'yoshihide', 'kenko', 'takasuenomusume', 'nukata', 'yotsugi', 'kazan', 'taketorinookina', 'mikado', 'ishitsukuri', 'kuramochi', 'abenomiushi', 'otomonomiyuki', 'isonokami'];
/** 台詞・人物解説を持つ先生のすべて */
export const ALL_TEACHER_IDS: readonly TeacherId[] = [...TEACHER_IDS, ...GUEST_TEACHER_IDS];

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
  // 2026-11-17 追加（ユーザー指示「竹取物語の問題の先生はかぐや姫に」）。教材の先生（竹取物語の読解テストをクリアすると選べる）。作中の人物
  kaguya: {
    id: 'kaguya',
    name: 'かぐや姫',
    kana: 'かぐやひめ',
    title: '『竹取物語』の主人公',
    oneLiner: '難題を出す月の姫。簡単にはほめない先生',
    profile: '『竹取物語』の作中の人物。五人の貴公子に難題を出し、帝の求めにも応じず、育ての親に手紙を残して月へ帰った。',
  },
  // 絵仏師良秀（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\yoshihide.json）
  yoshihide: {
    id: 'yoshihide',
    name: '絵仏師良秀',
    kana: 'えぶっしりょうしゅう',
    title: '『宇治拾遺物語』の絵仏師',
    oneLiner: '実物を見て悟る、口の悪い職人',
    profile: '『宇治拾遺物語』の説話に出る絵仏師。実物をよく見て描き方を悟り、「これこそせうとくよ」と言い切った。',
  },
  // 兼好法師（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\kenko.json）
  kenko: {
    id: 'kenko',
    name: '兼好法師',
    kana: 'けんこうほうし',
    title: '『徒然草』の作者',
    oneLiner: 'うのみにしない、皮肉まじりの法師',
    profile: '鎌倉時代の終わりから南北朝時代の歌人で、『徒然草』の作者。うわさを疑い、人の思い込みを笑いをまじえて書いた。',
  },
  // 菅原孝標女（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\takasuenomusume.json）
  takasuenomusume: {
    id: 'takasuenomusume',
    name: '菅原孝標女',
    kana: 'すがわらのたかすえのむすめ',
    title: '『更級日記』の作者',
    oneLiner: '物語が大好きな、読書仲間',
    profile: '『更級日記』の作者。少女のころ『源氏物語』を夢中で読んだ日々を、のちにふり返って書いた。本名は分かっていない。',
  },
  // 額田王（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\nukata.json）
  nukata: {
    id: 'nukata',
    name: '額田王',
    kana: 'ぬかたのおおきみ',
    title: '『万葉集』の宮廷歌人',
    oneLiner: 'みんなを送り出す、号令役の判者',
    profile: '七世紀の宮廷歌人。春と秋の優劣を歌で判じ「秋山我は」と結んだ。「熟田津に」は天皇の代わりに詠んだとする説が有力。',
  },
  // 大宅世継（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\yotsugi.json）
  yotsugi: {
    id: 'yotsugi',
    name: '大宅世継',
    kana: 'おおやけのよつぎ',
    title: '『大鏡』の語り手',
    oneLiner: '話し出すと止まらない、語りの翁',
    profile: '『大鏡』の作中の語り手で、実在しない。雲林院の菩提講で夏山繁樹と出会い、昔の帝や大臣の話を語り出す話し好きの翁。',
  },
  // 花山院（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\kazan.json）
  kazan: {
    id: 'kazan',
    name: '花山院',
    kana: 'かざんいん',
    title: '『大鏡』花山院の出家',
    oneLiner: '美しいものに目がない、風流の院',
    profile: '第65代の天皇（968〜1008）。和歌・絵・庭づくりに才があり、『大鏡』で「風流者」と評された。教材では『大鏡』の語りの中に出る。',
  },
  // 竹取の翁（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\taketorinookina.json）
  taketorinookina: {
    id: 'taketorinookina',
    name: '竹取の翁',
    kana: 'たけとりのおきな',
    title: '『竹取物語』かぐや姫の育ての親',
    oneLiner: 'わが子のことのように喜ぶ、竹取りのじい',
    profile: '『竹取物語』の作中の人物。光る竹の中に見つけた女の子をかぐや姫と名づけ、妻とともに大切に育てた老人。',
  },
  // 帝（竹取物語）（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\mikado.json）
  mikado: {
    id: 'mikado',
    name: '帝（竹取物語）',
    kana: 'みかど',
    title: '『竹取物語』に登場する帝',
    oneLiner: '見届けて認める、おおらかな帝',
    profile: '『竹取物語』の作中の帝。名は書かれていない。御狩の行幸で竹取の家を訪れ、物語の結びで「ふじの山」の名の由来となる。',
  },
  // 石作の皇子（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\ishitsukuri.json）
  ishitsukuri: {
    id: 'ishitsukuri',
    name: '石作の皇子',
    kana: 'いしつくりのみこ',
    title: '『竹取物語』五人の貴公子の一人',
    oneLiner: '近道で失敗した、本物探しの先輩',
    profile: '『竹取物語』で難題「仏の御石の鉢」を出された貴公子。山寺の古い鉢で済ませようとして、光が無いことで見破られた。',
  },
  // 庫持の皇子（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\kuramochi.json）
  kuramochi: {
    id: 'kuramochi',
    name: '庫持の皇子',
    kana: 'くらもちのみこ',
    title: '『竹取物語』五人の貴公子の一人',
    oneLiner: '作り物を見破られた、確かめの先輩',
    profile: '『竹取物語』で難題「蓬萊の玉の枝」を出された貴公子。そっくりの玉の枝を作らせたが、匠たちの訴えで作り物と分かった。',
  },
  // 右大臣阿部御主人（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\abenomiushi.json）
  abenomiushi: {
    id: 'abenomiushi',
    name: '右大臣阿部御主人',
    kana: 'うだいじんあべのみうし',
    title: '『竹取物語』の五人の貴公子の一人',
    oneLiner: '自分の目で確かめよと説く、太っ腹の大臣',
    profile: '『竹取物語』の作中の人物で、財産豊かな右大臣。かぐや姫に「火鼠の皮衣」を求められ、唐の商人に探させた。',
  },
  // 大納言大伴御行（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\otomonomiyuki.json）
  otomonomiyuki: {
    id: 'otomonomiyuki',
    name: '大納言大伴御行',
    kana: 'だいなごんおおとものみゆき',
    title: '『竹取物語』の五人の貴公子の一人',
    oneLiner: '一歩ずつ進めと励ます、豪快な親分',
    profile: '『竹取物語』の作中の人物で、大納言。かぐや姫に「龍の首の玉」を求められ、自分で船を出して嵐にあった。',
  },
  // 中納言石上麻呂足（教材の先生。2026-11-18 追加。設定 = F:\A2A\_work\work-teachers\design\isonokami.json）
  isonokami: {
    id: 'isonokami',
    name: '中納言石上麻呂足',
    kana: 'ちゅうなごんいそのかみのまろたり',
    title: '『竹取物語』の五人の貴公子の一人',
    oneLiner: '落ち着いていこうと並んで走る、素直な相棒',
    profile: '『竹取物語』の作中の人物で、中納言。かぐや姫に「燕の子安貝」を求められ、役人の知恵を借りて自分で巣を探った。',
  },
};

// 先生の絵の「みやび」（2026-11-13、Codex 作。背景は透明）。ファイル名は作業中の仮の名のまま <id>-anime.webp。
// 絵の雰囲気（PortraitTone）の miyabi を選ぶとこの絵になる（同日、先生の絵だけの別設定をやめて一本化した）。
// 小式部内侍の絵は、提供時は清少納言として描かれたもの。明るい笑顔が清少納言の型（強気なツンデレ）と合わず、
// 小式部内侍（元気な先輩）に回した（2026-11-13 ユーザー承認）。清少納言は同日、型に合わせて描き直した絵が届いて入れた。
/** みやびの絵がある先生（public/teachers/<id>-anime.webp）。無い先生は しっとり（sharp）の絵で出す */
// 2026-11-13 夜（ユーザー指示）：貫之として届いた絵を業平に回し、道真（固め）と貫之（ややファンキー）は40〜50代のイケオジに描き直した（Codex の依頼5）。
// 2026-11-17：かぐや姫（Codex の依頼7）。
// 教材の先生13人のみやびは Codex の依頼11・12（2026-11-18）。源氏の8人は依頼13で届いていて、源氏の先生と一緒に入れる
export const ANIME_TEACHER_IDS: readonly TeacherId[] = [
  'sei', 'murasaki', 'michizane', 'tsurayuki', 'teika', 'komachi', 'izumi', 'koshikibu', 'ukyo', 'narihira', 'kaguya',
  'nukata', 'yotsugi', 'kazan', 'yoshihide', 'kenko', 'takasuenomusume',
  'taketorinookina', 'mikado', 'ishitsukuri', 'kuramochi', 'abenomiushi', 'otomonomiyuki', 'isonokami',
];

// 表情差分（2026-11-18、ユーザー指示「先生の顔のバリエーションをつけたい」。調査 = F:\A2A\_work\work-teachers\expression-research.md）。
// base＝今の1枚／joy＝うれしい（正解）／cheer＝はげまし（不正解。がっかり・かわいそう・怒りの顔にしない＝教育研究による）。
// 段階1はゆるり×2表情×全員（Canva で今の絵を参照画像にして顔だけ変えた。原本 assets-src/teachers/expr/）。
// かぐや姫の joy は「解かれてやや悔しそう」、cheer は「まだ解かれず少し得意そう」（ユーザー指示）。ファイルは <id>-<tone>-<expr>.webp。無い組み合わせは base で出す。
export type TeacherExpression = 'base' | 'joy' | 'cheer';

/** 表情差分の絵がまだ無い先生（絵を足したらここから外す） */
const EXPRESSION_PENDING: readonly TeacherId[] = ['taketorinookina', 'mikado', 'ishitsukuri', 'kuramochi', 'abenomiushi', 'otomonomiyuki', 'isonokami'];

/** 表情差分の絵がある画風（先生ごと）。足したらここに書く */
export const TEACHER_EXPRESSION_TONES: Readonly<Partial<Record<TeacherId, readonly PortraitTone[]>>> = Object.fromEntries(
  ([...TEACHER_IDS, ...GUEST_TEACHER_IDS] as TeacherId[])
    .filter((id) => !EXPRESSION_PENDING.includes(id))
    .map((id) => [id, ['yuru'] as const]),
);

export function hasTeacherExpression(id: TeacherId, tone: PortraitTone, expr: TeacherExpression): boolean {
  return expr !== 'base' && (TEACHER_EXPRESSION_TONES[id] ?? []).includes(tone);
}

/** 先生の絵のパス。みやびは <id>-anime.webp、ほかは <id>-<tone>.webp。表情差分があれば <id>-<tone>-<expr>.webp */
export function teacherImage(id: TeacherId, tone: PortraitTone, expr: TeacherExpression = 'base'): string {
  if (tone === 'miyabi') return ANIME_TEACHER_IDS.includes(id) ? `/teachers/${id}-anime.webp` : `/teachers/${id}-sharp.webp`;
  if (hasTeacherExpression(id, tone, expr)) return `/teachers/${id}-${tone}-${expr}.webp`;
  return `/teachers/${id}-${tone}.webp`;
}

/** 答え合わせの判定 → 表情。1回の答え合わせに顔は1つ（調査の 2-1） */
export function expressionForVerdict(verdict: 'ok' | 'ng' | undefined): TeacherExpression {
  return verdict === 'ok' ? 'joy' : verdict === 'ng' ? 'cheer' : 'base';
}

export function isTeacherId(v: unknown): v is TeacherId {
  return typeof v === 'string' && (ALL_TEACHER_IDS as readonly string[]).includes(v);
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
