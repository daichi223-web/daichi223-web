// 読解の庭（/garden）の決まり。2026-11-21 ユーザー承認の計画（「その計画で進めて」）。
// 設計の調べ = F:\A2A\_work\kobun-garden\research.md（4章＝荒れた院をよみがえらせる）、絵の依頼 = 同 BRIEF-codex.md。
//
// 草木：教材ごとに1株。読解テストの記録（readingClear.ts の「8割以上を取った分類」）で育つ。
//   0 種    まだ何もしていない
//   1 芽    教材を開いた・読解テストを解いた
//   2 若葉  分類を1つ8割以上
//   3 つぼみ 分類の半分以上を8割以上
//   4 花    全部の分類を8割以上（教材の先生が手に入るのと同じ条件）→ 院が1か所よみがえる
//   5 満開  花のあと、日を改めて「全部まとめて」をもう一度8割以上
// 院：花が1本咲くたびに1か所よみがえる（全11か所）。咲いた教材に結びつく所がまだ荒れていれば、そこが先。

import { ALL_GROUPS, remainingGroups } from './readingClear';

export const GARDEN_RUNS_KEY = 'kobun.garden.runs';

export const STAGE_NAMES = ['種', '芽', '若葉', 'つぼみ', '花', '満開'] as const;
export type Stage = 0 | 1 | 2 | 3 | 4 | 5;
export const BLOOM_STAGE: Stage = 4;

/** 次の一歩（段ごと） */
export const NEXT_STEP: Record<Stage, string> = {
  0: '教材を開いて読んでみよう。芽が出ます。',
  1: '読解テストを解いて、分類を1つ8割以上にしよう。若葉になります。',
  2: 'ほかの分類も8割以上にしよう。半分そろうと、つぼみがつきます。',
  3: '残りの分類も8割以上にしよう。全部そろうと花が咲き、院が1か所よみがえります。',
  4: '日を改めて「全部まとめて」をもう一度8割以上にすると、満開になります。',
  5: '咲ききりました。ほかの教材の草木も育ててみよう。',
};

// ── 記録 ──
// 教材ごとに：その教材の分類（読解テストを開いたときの一覧）・花が咲いた日・満開になった日
export type GardenRun = { groups?: string[]; bloomDay?: string; fullDay?: string };
/** この機能より前に花の条件を満たしていた（咲いた日が分からない）印。日付より前に並ぶ */
export const EARLIER = '0000-00-00';

export function readGardenRuns(): Record<string, GardenRun> {
  try {
    const raw = localStorage.getItem(GARDEN_RUNS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, GardenRun>) : {};
  } catch {
    return {};
  }
}

function allCleared(groups: readonly string[], cleared: readonly string[]): boolean {
  return cleared.length > 0 && remainingGroups(groups, cleared).length === 0;
}

/** ローカルの YYYY-MM-DD */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 読解テストを1回解き終えたときに呼ぶ。8割に届かなかった回も呼ぶ（芽を出すため）。
 * groups = その教材の分類の id（無ければ空）、fullRun = 「全部まとめて」の回か、passed = この回が8割以上か。
 * clearedBefore / clearedAfter = この回の前と後の「8割以上を取った分類」。
 */
export function recordGardenRun(
  textId: string,
  opts: { groups: readonly string[]; clearedBefore: readonly string[]; clearedAfter: readonly string[]; fullRun: boolean; passed: boolean },
  today = localDay(),
): GardenRun {
  const all = readGardenRuns();
  const rec: GardenRun = { ...(all[textId] ?? {}), groups: [...opts.groups] };
  const doneBefore = allCleared(opts.groups, opts.clearedBefore);
  if (allCleared(opts.groups, opts.clearedAfter) && !rec.bloomDay) rec.bloomDay = doneBefore ? EARLIER : today;
  if (doneBefore && opts.fullRun && opts.passed && !rec.fullDay && rec.bloomDay && rec.bloomDay !== today) rec.fullDay = today;
  try {
    localStorage.setItem(GARDEN_RUNS_KEY, JSON.stringify({ ...all, [textId]: rec }));
  } catch {
    /* 覚えられなくても、テストの結果はそのまま */
  }
  return rec;
}

/** 草木の段。opened = 教材を開いたことがある、cleared = 8割以上を取った分類 */
export function plantStage(opened: boolean, cleared: readonly string[], run?: GardenRun): Stage {
  if (run?.fullDay) return 5;
  // 分類の一覧が無い（テストを開く前に記録された）ときは「全部まとめて」の印だけで花と見る
  const done = run?.groups ? allCleared(run.groups, cleared) : cleared.includes(ALL_GROUPS);
  if (done) return 4;
  if (cleared.length > 0) {
    const total = run?.groups?.length ?? 0;
    return total > 0 && cleared.length * 2 >= total ? 3 : 2;
  }
  return opened || run ? 1 : 0;
}

// ── 草木の種類（作品・ジャンルで決まる。どれも『源氏物語』少女巻の六条院の庭か、教材「野分のまたの日こそ」に出てくる草木） ──
export type PlantKey = 'sakura' | 'kobai' | 'momiji' | 'fuji' | 'hagi' | 'ominaeshi' | 'yamabuki';
export const PLANT_NAMES: Record<PlantKey, string> = {
  sakura: '桜', kobai: '紅梅', momiji: '紅葉', fuji: '藤', hagi: '萩', ominaeshi: '女郎花', yamabuki: '山吹',
};
/** 草木を決めた理由（前栽の見出しに出す） */
export const PLANT_REASON: Record<PlantKey, string> = {
  sakura: '物語', kobai: '歌物語・和歌', momiji: '軍記', fuji: '説話・歴史物語', hagi: '随筆', ominaeshi: '日記', yamabuki: '評論・俳諧・芸能ほか',
};

// 教材データのジャンルは「物語」がほぼ全部をまとめているので、作品名で先に分ける
const BY_WORK: Record<string, PlantKey> = {
  伊勢物語: 'kobai', 大和物語: 'kobai', 古今和歌集仮名序: 'kobai', 俊頼髄脳: 'kobai', 無名抄: 'kobai', 毎月抄: 'kobai',
  平家物語: 'momiji', 太平記: 'momiji',
  大鏡: 'fuji', 増鏡: 'fuji', 今鏡: 'fuji', 水鏡: 'fuji',
  三冊子: 'yamabuki', 去来抄: 'yamabuki', 玉勝間: 'yamabuki', 源氏物語玉の小櫛: 'yamabuki', 風姿花伝: 'yamabuki',
  謡曲: 'yamabuki', 野ざらし紀行: 'yamabuki', 奥の細道: 'yamabuki', 難波土産: 'yamabuki', 鶉衣: 'yamabuki',
  蕪村: 'yamabuki', 無名草子: 'yamabuki', おらが春: 'yamabuki',
};

/** 作品名の巻の注（「枕草子（一）」の（一）・「［蕪村］」の括弧）を外す */
export function workName(source: string | undefined): string {
  return (source ?? '').replace(/（[^）]*）$/, '').replace(/^［(.*)］$/, '$1').trim();
}

export function plantFor(source: string | undefined, genre: string | undefined): PlantKey {
  const w = workName(source);
  if (BY_WORK[w]) return BY_WORK[w];
  switch (genre) {
    case '物語': return 'sakura';
    case '和歌・韻文': return 'kobai';
    case '随筆': return 'hagi';
    case '日記': return 'ominaeshi';
    case '説話': return 'fuji';
    default: return 'yamabuki';
  }
}

export function plantImage(key: PlantKey, stage: Stage): string | null {
  return stage === 0 ? null : `/garden/plants/${key}-${stage}.webp`;
}

// ── 院（11か所） ──
export type EstateKey =
  | 'shinden' | 'nishi' | 'higashi' | 'yarimizu' | 'ike' | 'senzai'
  | 'nakajima' | 'kita' | 'chumon' | 'tsuridono' | 'tsuiji';

export type EstatePart = {
  key: EstateKey;
  name: string;
  yomi: string;
  /** よみがえった所のひとこと（古文常識。AI 作成・教員未確認）。くわしい解説は gardenGuide.ts */
  note: string;
  /** 荒れた姿 */
  ruined: string;
  /** 結びつく教材の ID（その教材が咲くと、ここが先によみがえる） */
  texts: string[];
};

// 直る順（research.md 4-3。遣水が先＝水が来てから池が満ちる）
export const ESTATE_PARTS: EstatePart[] = [
  { key: 'shinden', name: '寝殿', yomi: 'しんでん', ruined: '屋根に穴があき、簀子（すのこ）と高欄が落ちている。',
    note: '邸の主人が住む、南向きの中心の建物。中央の部屋が母屋（もや）、そのまわりが廂（ひさし）。正面の階（はし）の上には階隠（はしがくし）の屋根がある。',
    texts: ['bb32c7b026', '1811f6888e'] }, // 宣耀殿の女御・野分のまたの日こそ
  { key: 'nishi', name: '西の対と渡殿', yomi: 'にしのたい・わたどの', ruined: '対屋が傾き、屋根がはがれている。渡殿は途中で崩れている。',
    note: '寝殿の西に建つ対屋（たいのや）。寝殿とは、屋根のある渡り廊下＝渡殿と、壁の無い吹き放ちの透渡殿（すきわたどの）でつなぐ。間の小さな庭が壺（つぼ）。',
    texts: ['f84b5ac5c5'] }, // 月やあらぬ
  { key: 'higashi', name: '東の対と渡殿', yomi: 'ひがしのたい・わたどの', ruined: '対屋が傾き、渡殿が崩れて途中で途切れている。',
    note: '寝殿の東の対屋。寝殿とは渡殿・透渡殿でつなぎ、間の壺を遣水が流れる。',
    texts: ['cec7f3b46f', '249a2e97df'] }, // 光源氏の誕生・廃院の怪
  { key: 'yarimizu', name: '遣水', yomi: 'やりみず', ruined: '水が止まり、涸れた溝になっている。',
    note: '庭に水を引き入れて池へ注ぐ、人の手で作った細い流れ。この絵では、北から入り、寝殿と東の対の間を流れて池へ注ぐ。',
    texts: ['068cd465f4'] }, // 土御門殿の秋
  { key: 'ike', name: '池と南庭', yomi: 'いけ・なんてい', ruined: '池の水が引いて底が見え、庭は草ぼうぼう。',
    note: '寝殿の南の、白い砂を敷いた広い庭と、その先の池。儀式や遊びの場になった。池の南には築山（つきやま）。',
    texts: ['068cd465f4'] }, // 土御門殿の秋
  { key: 'senzai', name: '前栽と透垣', yomi: 'せんざい・すいがい', ruined: '八重むぐら（つる草）が茂り、透垣は倒れている。',
    note: '前栽は庭に植えた草木の植え込み。透垣は板を透かして組んだ垣。',
    texts: ['1811f6888e', '467249bc39', 'f78ab86be9'] }, // 野分のまたの日こそ・萩のうは露・心づくしの秋
  { key: 'nakajima', name: '中島と反橋', yomi: 'なかじま・そりはし', ruined: '反橋が落ち、平橋は板が抜けて、島へ渡れない。',
    note: '池の中の島。南庭からは弧を描く反橋、島の南には平らな平橋（ひらはし）が架かる。', texts: [] },
  { key: 'kita', name: '北の対', yomi: 'きたのたい', ruined: '対屋が崩れている。',
    note: '寝殿の北の対屋。正妻を「北の方」と呼ぶのは、北の対に住んだことからとされる。',
    texts: ['956e5deab8'] }, // 刑部卿敦兼の北の方
  { key: 'chumon', name: '中門廊と中門', yomi: 'ちゅうもんろう・ちゅうもん', ruined: '廊が崩れ、中門が傾いている。',
    note: '東西の対屋から南へ、池のほうへ延びる廊。途中に中門を開き、南庭への入口にした。', texts: [] },
  { key: 'tsuridono', name: '釣殿', yomi: 'つりどの', ruined: '傾いて、池に沈みかけている。',
    note: '中門廊の先で、池に臨んで建つ吹き放ちの建物。池を眺めて涼んだり、宴を開いたりした。', texts: [] },
  { key: 'tsuiji', name: '築地と門', yomi: 'ついじ・もん', ruined: '土塀が崩れて穴があいている。',
    note: '邸のまわりを囲む、土を突き固めて瓦の屋根をのせた塀と、東西の門。手入れをしないと崩れたり草が生えたりする。',
    texts: ['0fa06efdfe', '946616b6f3'] }, // 夢よりもはかなき世の中を・養和の飢饉
];

export type Bloom = { textId: string; day: string };
export type Restored = { key: EstateKey; by: string };

/**
 * 咲いた教材から、よみがえった所を順に出す。咲いた日の順（同じ日は教材 ID の順）に1本ずつ見て、
 * その教材に結びつく所がまだ荒れていればそこ、無ければ直る順で次の所。
 */
export function restoredParts(blooms: readonly Bloom[]): Restored[] {
  const order = [...blooms].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.textId < b.textId ? -1 : a.textId > b.textId ? 1 : 0));
  const out: Restored[] = [];
  const done = new Set<EstateKey>();
  for (const b of order) {
    if (done.size >= ESTATE_PARTS.length) break;
    const part = ESTATE_PARTS.find((p) => !done.has(p.key) && p.texts.includes(b.textId)) ?? ESTATE_PARTS.find((p) => !done.has(p.key))!;
    done.add(part.key);
    out.push({ key: part.key, by: b.textId });
  }
  return out;
}

/** 次に（結びつきの無い教材が咲いたときに）よみがえる所 */
export function nextPart(restored: readonly Restored[]): EstatePart | null {
  const done = new Set(restored.map((r) => r.key));
  return ESTATE_PARTS.find((p) => !done.has(p.key)) ?? null;
}

/** 季節（空の色を変える）。3〜5月＝春、6〜8月＝夏、9〜11月＝秋、12〜2月＝冬 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export function seasonOf(d = new Date()): Season {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}
