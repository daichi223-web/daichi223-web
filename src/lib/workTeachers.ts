import { useEffect, useState } from 'react';
import { GUEST_TEACHER_IDS, type GuestTeacherId, type TeacherId } from './teachers';

// 教材ごとの先生（2026-11-17 ユーザー指示「竹取物語の問題の先生はかぐや姫に」「土佐日記は紀貫之、伊勢物語は業平…今ある作品ごとに」）。
// 読解テストでは、選んでいる先生より、ここで決まる教材の先生を優先して出す。決まっていない教材は選んでいる先生のまま。
// 案の一覧（作品内の人物・作者。第2段以降の人を含む）= F:\A2A\_work\work-teachers\README.md。
// ここに書くのは、絵と台詞がそろって TeacherId になった先生だけ（まだの人は書かない＝選んでいる先生のまま）。
// 例：無名草子は俊成卿女（2026-11-17 ユーザー指示）。まだ作っていないので書いていない。

/** 作品名（texts-v3 の source ＝ 索引の source_work）→ 先生 */
export const BY_WORK: Readonly<Record<string, TeacherId>> = {
  '竹取物語': 'kaguya',
  '伊勢物語': 'narihira',
  '土佐日記': 'tsurayuki',
  '古今和歌集仮名序': 'tsurayuki',
  '枕草子（一）': 'sei',
  '枕草子（二）': 'sei',
  '紫式部日記': 'murasaki',
  '和泉式部日記': 'izumi',
  '建礼門院右京大夫集': 'ukyo',
  '毎月抄': 'teika',
  '徒然草': 'kenko',
  '更級日記': 'takasuenomusume',
  // 源氏物語は1本ごとの作中の人物を BY_TEXT に書く。ここは決めていない教材（亡くなる場面・廃院の怪）の作者の紫式部。
  '源氏物語（一）': 'murasaki',
  '源氏物語（二）': 'murasaki',
};

/** 教材ID → 先生（作品より優先。作品名の無い和歌の教材や、1本だけ別の人にする教材） */
export const BY_TEXT: Readonly<Record<string, TeacherId>> = {
  b34f00e739: 'michizane', // 大鏡「菅公配流」
  faa890f809: 'teika', // 中世の歌
  f0740d6350: 'komachi', // 王朝の歌
  '31d11bf2f8': 'yoshihide', // 宇治拾遺物語「絵仏師良秀」
  '2e45c61a81': 'nukata', // 万葉の歌
  '61ad02e1df': 'yotsugi', // 大鏡「雲林院にて」
  b8832b8fec: 'yotsugi', // 大鏡「中宮安子の嫉妬」（語り手の世継）
  bb32c7b026: 'yotsugi', // 大鏡「宣耀殿の女御」（語り手の世継）
  f7aee682ff: 'kazan', // 大鏡「花山院の出家」
  // 竹取物語は章段ごとに中心の人物（2026-11-18 ユーザー決定）。妻問い・天の羽衣は BY_WORK のかぐや姫のまま。
  ec2159c6e8: 'taketorinookina', // 竹取物語「かぐや姫の生い立ち」
  e9846f4330: 'ishitsukuri', // 竹取物語「仏の御石の鉢」
  '97a9d9174a': 'kuramochi', // 竹取物語「蓬萊の玉の枝」
  '5954a8d9eb': 'abenomiushi', // 竹取物語「火鼠の皮衣」
  cd8147e868: 'otomonomiyuki', // 竹取物語「龍の首の玉」
  '949859d6f5': 'isonokami', // 竹取物語「燕の子安貝」
  '7eb37dba92': 'mikado', // 竹取物語「御狩のみゆき」
  '067781f251': 'mikado', // 竹取物語「ふじの煙」
  // 源氏物語は1本ごとに中心の人物（2026-11-18 ユーザー決定）。亡くなる場面（飽かぬ別れ・萩のうは露）と廃院の怪は BY_WORK の紫式部のまま。
  cec7f3b46f: 'kiritsubo', // 源氏物語「光源氏の誕生」
  fd3012c216: 'wakamurasaki', // 源氏物語「若紫の君」（2026-11-19 紫の上から若紫へ。紫の上は GROWN_UP で加わる）
  da30d34a6c: 'onnasannomiya', // 源氏物語「暁の雪」
  f78ab86be9: 'hikaru', // 源氏物語「心づくしの秋」
  '0a93657296': 'akashi', // 源氏物語「母子の別離」
  '364673ceb1': 'aoi', // 源氏物語「車争ひ」
  fe466e5a11: 'kaoru', // 源氏物語「霧の中のかいま見」
  '4c5d7950dd': 'oigimi', // 源氏物語「髪の香」（妹の中の君は COMPANIONS で一緒に加わる）
  // 2026-11-19 ユーザー指示「行成、公任あたりも入れて」「宣長出す」。3本とも 11/3 時点で未公開＝公開まで手に入らない
  f1c4b82dd3: 'kinto', // 大鏡「公任、三船の誉れ」
  ff9c2346eb: 'yukinari', // 枕草子「上にさぶらふ御猫は」（清少納言から行成へ。ユーザー選択）
  '8bb763a731': 'norinaga', // 源氏物語玉の小櫛「もののあはれ論」
};

/** この教材の先生。決まっていなければ null（選んでいる先生のまま） */
export function workTeacherOf(textId: string, source: string | null | undefined): TeacherId | null {
  return BY_TEXT[textId] ?? (source ? BY_WORK[source] : undefined) ?? null;
}

// ── 教材をクリアすると、その教材の先生が手に入る（2026-11-17 ユーザー指示） ──
// 手に入るのは、はじめから選べる10人以外（GUEST_TEACHER_IDS）。端末ごと（先生の選択と同じ）。
// クリア＝読解テストを最後まで解いて、正解が8割以上（3問以上のとき）。分類を選んで解いた回でもよい。

export const UNLOCKED_TEACHERS_KEY = 'kobun.chat.unlockedTeachers';
const UNLOCK_EVENT = 'kobun:unlocked-teachers-change';
export const CLEAR_RATE = 0.8;
export const CLEAR_MIN_QUESTIONS = 3;

export function isGuestTeacherId(v: unknown): v is GuestTeacherId {
  return typeof v === 'string' && (GUEST_TEACHER_IDS as readonly string[]).includes(v);
}

export function isReadingTestCleared(correct: number, total: number): boolean {
  return total >= CLEAR_MIN_QUESTIONS && correct >= Math.ceil(total * CLEAR_RATE);
}

export function readUnlockedTeachers(): GuestTeacherId[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_TEACHERS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? GUEST_TEACHER_IDS.filter((id) => list.includes(id)) : [];
  } catch {
    return [];
  }
}

export function isTeacherUnlocked(id: TeacherId): boolean {
  return !isGuestTeacherId(id) || readUnlockedTeachers().includes(id);
}

/** 手に入れる。新しく手に入ったときだけ true */
export function unlockTeacher(id: TeacherId): boolean {
  if (!isGuestTeacherId(id)) return false;
  const now = readUnlockedTeachers();
  if (now.includes(id)) return false;
  try {
    localStorage.setItem(UNLOCKED_TEACHERS_KEY, JSON.stringify([...now, id]));
    window.dispatchEvent(new CustomEvent(UNLOCK_EVENT));
  } catch {
    return false;
  }
  return true;
}

// ── 一緒に・あとから加わる先生（2026-11-19 ユーザー決定） ──
/** 一緒に加わる：大君を手に入れると、妹の中の君も（「お姉さまと一緒に来ました」） */
export const COMPANIONS: Readonly<Partial<Record<GuestTeacherId, readonly GuestTeacherId[]>>> = {
  oigimi: ['nakanokimi'],
};

/** 育って加わる：若紫を手に入れたあと、源氏物語のほかの教材を1本クリアすると、大人になった紫の上も */
export const GROWN_UP = {
  from: 'wakamurasaki',
  to: 'murasakinoue',
  works: ['源氏物語（一）', '源氏物語（二）'],
} as const satisfies { from: GuestTeacherId; to: GuestTeacherId; works: readonly string[] };

/**
 * 教材の読解テストを全部の分類でクリアしたとき、手に入る先生を手に入れる。新しく手に入った先生を順に返す。
 * その教材の先生 → 一緒に加わる先生 → 育って加わる先生（若紫の教材そのものは「ほかの教材」に数えない）。
 */
export function unlockOnTextClear(textId: string, source: string | null | undefined): GuestTeacherId[] {
  const had = readUnlockedTeachers();
  const own = workTeacherOf(textId, source);
  const want: TeacherId[] = own ? [own] : [];
  if (had.includes(GROWN_UP.from) && own !== GROWN_UP.from && source && (GROWN_UP.works as readonly string[]).includes(source)) {
    want.push(GROWN_UP.to);
  }
  const got: GuestTeacherId[] = [];
  for (const id of want) {
    if (!isGuestTeacherId(id)) continue;
    for (const t of [id, ...(COMPANIONS[id] ?? [])]) if (unlockTeacher(t)) got.push(t);
  }
  return got;
}

/** どの教材をクリアすると手に入るか（設定欄の鍵つきの先生に出す） */
export const GUEST_UNLOCK_HINT: Readonly<Record<GuestTeacherId, string>> = {
  kaguya: '竹取物語「貴公子たちの妻問い」か「天の羽衣」の読解テストをクリア',
  taketorinookina: '竹取物語「かぐや姫の生い立ち」の読解テストをクリア',
  ishitsukuri: '竹取物語「仏の御石の鉢」の読解テストをクリア',
  kuramochi: '竹取物語「蓬萊の玉の枝」の読解テストをクリア',
  abenomiushi: '竹取物語「火鼠の皮衣」の読解テストをクリア',
  otomonomiyuki: '竹取物語「龍の首の玉」の読解テストをクリア',
  isonokami: '竹取物語「燕の子安貝」の読解テストをクリア',
  mikado: '竹取物語「御狩のみゆき」か「ふじの煙」の読解テストをクリア',
  kiritsubo: '源氏物語「光源氏の誕生」の読解テストをクリア',
  wakamurasaki: '源氏物語「若紫の君」の読解テストをクリア',
  murasakinoue: '若紫を手に入れたあと、源氏物語のほかの教材をクリア',
  onnasannomiya: '源氏物語「暁の雪」の読解テストをクリア',
  hikaru: '源氏物語「心づくしの秋」の読解テストをクリア',
  akashi: '源氏物語「母子の別離」の読解テストをクリア',
  aoi: '源氏物語「車争ひ」の読解テストをクリア',
  kaoru: '源氏物語「霧の中のかいま見」の読解テストをクリア',
  oigimi: '源氏物語「髪の香」の読解テストをクリア',
  nakanokimi: '源氏物語「髪の香」の読解テストをクリア（姉の大君と一緒に）',
  kinto: '大鏡「公任、三船の誉れ」の読解テストをクリア',
  yukinari: '枕草子「上にさぶらふ御猫は」の読解テストをクリア',
  norinaga: '源氏物語玉の小櫛「もののあはれ論」の読解テストをクリア',
  yoshihide: '宇治拾遺物語「絵仏師良秀」の読解テストをクリア',
  kenko: '徒然草の読解テストをクリア',
  takasuenomusume: '更級日記の読解テストをクリア',
  nukata: '「万葉の歌」の読解テストをクリア',
  yotsugi: '大鏡「雲林院にて」の読解テストをクリア',
  kazan: '大鏡「花山院の出家」の読解テストをクリア',
};

export function useUnlockedTeachers(): GuestTeacherId[] {
  const [list, setList] = useState<GuestTeacherId[]>(readUnlockedTeachers);
  useEffect(() => {
    const sync = () => setList(readUnlockedTeachers());
    window.addEventListener('storage', sync);
    window.addEventListener(UNLOCK_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(UNLOCK_EVENT, sync);
    };
  }, []);
  return list;
}
