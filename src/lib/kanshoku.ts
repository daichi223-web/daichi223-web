import { useEffect, useState } from 'react';
import { STAGES, type Stage } from './nobleData';
import { CAREER_ROUTES, CAREER_TERMS, KANSHOKU_STAGE_POSTS, NEXT_POSTS, NYOBO, POST_KAISETSU, PROVINCE_KAISETSU, ZURYO_KAISETSU, ZURYO_POSTS } from './kanshokuData';

// 位階の段ごとに、名乗る官職を選ぶ（2026-11-17 ユーザー指示「位階で中国守・小国・大国とかを選べるように」「官位も選べるように。蔵人など有名どころを」）。
// 候補の表は kanshokuData.ts（官位令・慣例で照合した結果。根拠と出典 = F:\A2A\_work\kanshoku\）。
// 受領（国司）は等級ごとに国を選ぶ（例：大国守 → 播磨守）。国の等級は延喜式（民部上）。
// 選んだものは端末ごと（kobun.noble.chosenPost）。選んでいなければ STAGES の post の先頭（今までの表示）。

export type ProvinceGrade = '大国' | '上国' | '中国' | '下国';

/** 延喜式の国の等級（大国13・上国35・中国11・下国9＝68か国） */
export const PROVINCES: Readonly<Record<ProvinceGrade, readonly string[]>> = {
  大国: ['大和', '河内', '伊勢', '武蔵', '上総', '下総', '常陸', '近江', '上野', '陸奥', '越前', '播磨', '肥後'],
  上国: [
    '山城', '摂津', '尾張', '三河', '遠江', '駿河', '甲斐', '相模', '美濃', '信濃', '下野', '出羽',
    '加賀', '越中', '越後', '丹波', '但馬', '因幡', '伯耆', '出雲', '美作', '備前', '備中', '備後',
    '安芸', '周防', '紀伊', '阿波', '讃岐', '伊予', '豊前', '豊後', '筑前', '筑後', '肥前',
  ],
  中国: ['安房', '若狭', '能登', '佐渡', '丹後', '石見', '長門', '土佐', '日向', '大隅', '薩摩'],
  下国: ['和泉', '伊賀', '志摩', '伊豆', '飛騨', '隠岐', '淡路', '壱岐', '対馬'],
};

/** 親王任国：守は親王が任じられ、実際に下るのは介。生徒が名乗れるのは「介」だけ */
export const SHINNO_NINKOKU: readonly string[] = ['上総', '常陸', '上野'];

export type { ZuryoRow as ZuryoPost } from './kanshokuData';

export type PostOption =
  | { kind: 'post'; name: string; note?: string }
  | { kind: 'zuryo'; grade: ProvinceGrade; post: '守' | '介'; provinces: string[] };

/** 第 n 階で選べる官職。受領は等級ごとにまとめ、国の一覧を添える */
export function postOptions(n: number): PostOption[] {
  const posts: PostOption[] = (KANSHOKU_STAGE_POSTS[n] ?? []).map((p) => ({ kind: 'post', name: p.name, note: p.note }));
  const zuryo: PostOption[] = ZURYO_POSTS.filter((z) => z.n === n).map((z) => ({
    kind: 'zuryo',
    grade: z.grade,
    post: z.post,
    provinces: PROVINCES[z.grade].filter((p) => (z.post === '守' ? !SHINNO_NINKOKU.includes(p) : true)),
  }));
  return [...zuryo, ...posts];
}

/** 第 n 階で名乗れる名前の一覧（受領は「播磨守」の形に開く） */
export function postNames(n: number): string[] {
  return postOptions(n).flatMap((o) => (o.kind === 'post' ? [o.name] : o.provinces.map((p) => `${p}${o.post}`)));
}

// ── 選んだ官職（端末ごと） ──
export const CHOSEN_POST_KEY = 'kobun.noble.chosenPost';
const CHANGE_EVENT = 'kobun:chosen-post-change';

type ChosenMap = Partial<Record<number, string>>;

function readMap(): ChosenMap {
  try {
    const raw = localStorage.getItem(CHOSEN_POST_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as ChosenMap) : {};
  } catch {
    return {};
  }
}

/** 第 n 階で選んだ官職（候補に無いもの＝表を直したあとの古い値は捨てる） */
export function readChosenPost(n: number): string | null {
  const v = readMap()[n];
  return typeof v === 'string' && postNames(n).includes(v) ? v : null;
}

/** 選ぶ。null で選ぶ前（既定の表示）に戻す */
export function writeChosenPost(n: number, name: string | null): void {
  try {
    const map = readMap();
    if (name === null) delete map[n];
    else map[n] = name;
    localStorage.setItem(CHOSEN_POST_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* noop */
  }
}

/** 既定の表示（今までと同じ＝post の先頭） */
export function defaultPost(stage: Pick<Stage, 'post'>): string {
  return stage.post.split('・')[0];
}

/** 画面に出す官職名 */
export function displayPost(stage: Pick<Stage, 'n' | 'post'>): string {
  return readChosenPost(stage.n) ?? defaultPost(stage);
}

/** 画面に出す官職名（選び直すとすぐ変わる） */
export function useDisplayPost(stage: Pick<Stage, 'n' | 'post'>): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('storage', bump);
    window.addEventListener(CHANGE_EVENT, bump);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener(CHANGE_EVENT, bump);
    };
  }, []);
  return displayPost(stage);
}

export const STAGE_COUNT = STAGES.length;

// ── 解説（2026-11-17 ユーザー指示「官職や国を選ぶ時に簡単な解説を表示させたい」） ──
export type KaisetsuView = { title: string; kana: string; lines: string[]; next?: { post: string; route: string }[] };

const POST_KANA = { 守: 'かみ', 介: 'すけ' } as const;

/**
 * 選んだ・触った名前の解説。官職名・「播磨守」のような受領・「大国守」のような等級＋守介に対応する。
 * 解説の無い名前は null（推測で作らない）。
 */
export function kaisetsuFor(name: string): KaisetsuView | null {
  const v = kaisetsuBody(name);
  if (!v) return null;
  const next = nextPostsOf(name);
  return next.length ? { ...v, next } : v;
}

/** 国名の等級（大国〜下国）。国名でなければ null */
function gradeOf(province: string): ProvinceGrade | null {
  return (Object.keys(PROVINCES) as ProvinceGrade[]).find((g) => PROVINCES[g].includes(province)) ?? null;
}

/**
 * この官職のあと、よく進む先（出世ルートの名前つき）。受領は「播磨守」→「大国守」のように等級で引く。
 * 根拠のあるものだけ（routes.json の next）。無ければ空。
 */
export function nextPostsOf(name: string): { post: string; route: string }[] {
  let key = name;
  const m = name.match(/^(.+?)(守|介)$/);
  if (!NEXT_POSTS[key] && m) {
    const g = gradeOf(m[1]);
    if (g) key = `${g}${m[2]}`;
  }
  const routeName = (id: string) => CAREER_ROUTES.find((r) => r.id === id)?.name ?? id;
  return (NEXT_POSTS[key] ?? []).map((x) => ({ post: x.post, route: routeName(x.route) }));
}

function kaisetsuBody(name: string): KaisetsuView | null {
  const term = CAREER_TERMS[name];
  if (term) return { title: name, kana: term.kana, lines: [term.text] };
  const nyobo = NYOBO.posts.find((x) => x.name === name);
  if (nyobo) return { title: name, kana: nyobo.kana, lines: [nyobo.text] };
  const post = POST_KAISETSU[name];
  if (post) return { title: name, kana: post.kana, lines: [post.text] };
  const m = name.match(/^(.+?)(守|介)$/);
  if (!m) return null;
  const [, head, kami] = m as unknown as [string, string, '守' | '介'];
  const role = ZURYO_KAISETSU[kami];
  const grade = ZURYO_KAISETSU[head];
  if (grade && role) return { title: name, kana: `${grade.kana}の${POST_KANA[kami]}`, lines: [grade.text, role.text] };
  const prov = PROVINCE_KAISETSU[head];
  if (prov && role) {
    return { title: name, kana: `${prov.kana}の${POST_KANA[kami]}`, lines: [prov.text, role.text] };
  }
  return null;
}
