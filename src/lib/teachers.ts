import type { PortraitTone } from './portraitTone';

// 単語クイズの答え合わせ（LINE 風）で話す先生。史実の人物像に寄せた口調で話す（台詞の本体は teacherLines.ts）。
// 絵は public/teachers/<id>-<tone>.webp（200px 正方形。画風は位階の肖像と同じ sharp / yuru / pop）。
// 台詞の決まり（変数名・状況・字数）は F:\A2A\_work\kobun-chat-feedback\BRIEF-lines.md。

// 先生の口調（キャラの台詞）を答え合わせに出すか。false の間は中立の文（teacherLines.ts の NEUTRAL_LINES）で出し、
// 設定欄の人物紹介も出さない。台詞を原典で照合してから true にする（2026-11-02 ユーザー指示「まずコメントなし版をデプロイ」）
export const TEACHER_VOICE_ENABLED = false;

export type TeacherId = 'sei' | 'murasaki' | 'michizane' | 'tsurayuki' | 'teika';

export const TEACHER_IDS: readonly TeacherId[] = ['sei', 'murasaki', 'michizane', 'tsurayuki', 'teika'];

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
    profile: '中宮定子に仕えた機知の人。「をかし」で切れ味よく断じ、ほめるときは短く、くやしさは引きずらない。',
  },
  murasaki: {
    id: 'murasaki',
    name: '紫式部',
    kana: 'むらさきしきぶ',
    title: '『源氏物語』の作者',
    oneLiner: '控えめな丁寧語で、答え方をそっと見ている先生',
    profile: '中宮彰子に仕え、人の心の機微を物語に描いた。丁寧で控えめだが、あなたの答え方までよく見ている。',
  },
  michizane: {
    id: 'michizane',
    name: '菅原道真',
    kana: 'すがわらのみちざね',
    title: '『菅家文草』の漢詩人、のちの学問の神',
    oneLiner: '字義と道理で教える厳格な師。努力は必ず認める。',
    profile: '漢詩文の大学者で右大臣。のちに学問の神（天神）。字義と道理を重んじる厳格な師だが、努力は必ず認める。',
  },
  tsurayuki: {
    id: 'tsurayuki',
    name: '紀貫之',
    kana: 'きのつらゆき',
    title: '『古今和歌集』の撰者',
    oneLiner: '言の葉の心を、やわらかく見てくれる先生',
    profile: '仮名序に「やまとうたは、人の心を種として」。言葉の中身＝心を、種や芽にたとえてやわらかく見てくれる。',
  },
  teika: {
    id: 'teika',
    name: '藤原定家',
    kana: 'ふじわらのていか',
    title: '『新古今和歌集』の撰者・百人一首の選者',
    oneLiner: '歌合の判者。辛口だが、正しい答えは認める。',
    profile: '歌合の判者のように「可」「難あり」と短く評する。辛口だが、正しい答えはきちんと認め、直せば良くなると言う。',
  },
};

/** 先生の絵のパス。画風は位階の肖像と同じ値を使う */
export function teacherImage(id: TeacherId, tone: PortraitTone): string {
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

/** variant を決定的に1つ選ぶ（seed のハッシュ % 個数）。空配列なら '' */
export function pickVariant(variants: readonly string[], seed: string): string {
  if (variants.length === 0) return '';
  return variants[hashSeed(seed) % variants.length] ?? '';
}
