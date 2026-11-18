import { KANSHOKU_STAGE_POSTS, ZURYO_POSTS } from './kanshokuData';

// 位階表の「系統」（2026-11-18 ユーザー指示「位階表は縦の系統がわかるようにして」）。
// 縦＝位、横＝役所の系統の表にして、同じ列を縦に読むと、その役所の中での上がり方（例：近衛 少将→中将→大将）が分かるようにする。
// 振り分けは、官職の注（kanshokuData.ts の note）にある官位令の官司名による。kanshokuData.ts は生成物なので、表はここに手で持つ。
// 官職を足したら、ここにも書く（書き忘れは src/tests/kanniKeito.test.ts が止める）。

export type Keito = { id: string; name: string; note: string; posts: readonly string[] };

export const KEITO: readonly Keito[] = [
  { id: 'daijokan', name: '太政官', note: '参議→納言→大臣', posts: ['参議', '中納言', '大納言', '内大臣', '右大臣', '左大臣', '太政大臣', '摂政', '関白'] },
  { id: 'benkan', name: '弁官', note: '史→弁', posts: ['少史', '大史', '少弁', '中弁', '大弁'] },
  { id: 'geki', name: '外記・少納言', note: '外記→少納言', posts: ['少外記', '大外記', '少納言'] },
  { id: 'kurodo', name: '蔵人', note: '六位→五位→頭', posts: ['六位蔵人', '五位蔵人', '蔵人頭'] },
  { id: 'konoe', name: '近衛', note: '少将→中将→大将', posts: ['近衛少将', '近衛中将', '近衛大将'] },
  { id: 'emon', name: '衛門・兵衛・検非違使', note: '志→尉→佐→督', posts: ['衛門志', '衛門少尉', '衛門大尉', '検非違使尉', '衛門佐', '兵衛佐', '検非違使佐', '衛門督', '兵衛督'] },
  { id: 'hassho', name: '八省', note: '録→丞→輔→卿（中務・刑部を含む）', posts: ['少録', '大録', '少内記', '大内記', '少丞', '大丞', '少判事', '中判事', '大判事', '侍従', '少輔', '中務少輔', '大輔', '中務大輔', '七省卿', '中務卿'] },
  { id: 'kokushi', name: '国司', note: '目→掾→介→守', posts: ['大目', '中国掾', '大掾', '下国守', '上国介', '大国介', '中国守', '上国守', '大国守'] },
  { id: 'dazaifu', name: '大宰府', note: '監→弐→帥', posts: ['大宰少監', '大宰大監', '大宰少弐', '大宰大弐', '大宰帥'] },
  { id: 'hoka', name: '寮・宮・台ほか', note: '寮・職・坊・弾正台・京職など', posts: ['雑任', '史生', '舎人', '使部', '大属', '大允', '陰陽師', '陰陽博士', '陰陽頭', '大学博士', '大学頭', '馬頭', '少進', '大進', '中宮大夫', '大膳大夫', '京大夫', '弾正弼', '弾正尹', '東宮傅'] },
];

const KEITO_OF = new Map<string, string>(KEITO.flatMap((k) => k.posts.map((p) => [p, k.id] as const)));

/** 官職の系統。表に無ければ「寮・宮・台ほか」 */
export function keitoOf(post: string): string {
  return KEITO_OF.get(post) ?? 'hoka';
}

/** その段で名乗れる官職（受領を含む。受領は「大国守」の形）。系統の表の並びで並べる */
export function postsAt(n: number): string[] {
  const zuryo = ZURYO_POSTS.filter((z) => z.n === n).map((z) => `${z.grade}${z.post}`);
  const posts = (KANSHOKU_STAGE_POSTS[n] ?? []).map((p) => p.name);
  return [...zuryo, ...posts];
}

/** 段 n・系統 id のマスに入る官職 */
export function cellPosts(n: number, keito: string): string[] {
  const order = KEITO.find((k) => k.id === keito)?.posts ?? [];
  return postsAt(n)
    .filter((p) => keitoOf(p) === keito)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** 系統ごとに、官職のあるいちばん下の段といちばん上の段（縦の線を引く範囲） */
export function keitoSpan(keito: string, stages: readonly number[]): { min: number; max: number } | null {
  const ns = stages.filter((n) => cellPosts(n, keito).length > 0);
  return ns.length ? { min: Math.min(...ns), max: Math.max(...ns) } : null;
}
