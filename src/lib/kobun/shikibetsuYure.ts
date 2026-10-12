/**
 * 識別クイズの「揺れ」— 文法上どちらとも取れる箇所の扱い。
 * findShikibetsu は grammarTag から正解を1つに決めるが、連体形に付く「に」のように
 * 格助詞（下に体言「時・所」を補う）とも接続助詞とも取れる箇所がある。そこを教材ごとに手で指定する。
 * - both: どちらを選んでも正解（両説が並び立つ）
 * - partial: 選んだら △（成り立たなくはないが、ふつうは正解の方で取る）
 * 鍵は `${教材ID}:${対象の最初のトークンID}`。2026-10-12 公開教材の「に」「なり」を調査して作成
 * 2026-10-13 国語学の論文で照合して見直し（接続助詞を広く認める山口1980・京極1987の立場に立つ。
 * 格助詞を基本とする立場＝信太1987・土岐2012・国語研の品詞付与規程もあるので、△の説明に残す）。
 */
import type { ShikibetsuTarget } from "./shikibetsu";

export interface Yure {
  /** 選んでも正解にする選択肢 */
  both?: string[];
  /** 選んだら △ にする選択肢 */
  partial?: string[];
  /** 揺れの説明 */
  note: string;
}

const NI_BOTH = "連体形に付く「に」。下に「時・所」などを補えば格助詞、「〜すると・〜ところ」と下へ続けて読めば接続助詞で、どちらとも取れる。";
const NI_PARTIAL = "連体形に付き「〜すると・〜ところ」と下へ続くので、ふつうは接続助詞と取る。下に「時・所」を補えば格助詞とも読めるので △（格助詞と取る学説もある）。";
const NI_PARTIAL_SETSU = "「来」が「に」を行き着く先として受けるので、ふつうは格助詞と取る（暗い所に来た）。「暗いのに来た」と下へ続けて読めば接続助詞とも取れるので △。";

const both = (...keys: string[]): Record<string, Yure> =>
  Object.fromEntries(keys.map((k) => [k, { both: ["kaku", "setsuzoku"], note: NI_BOTH }]));
const partialSetsuzoku = (...keys: string[]): Record<string, Yure> =>
  Object.fromEntries(keys.map((k) => [k, { partial: ["setsuzoku"], note: NI_PARTIAL_SETSU }]));
const partialKaku = (...keys: string[]): Record<string, Yure> =>
  Object.fromEntries(keys.map((k) => [k, { partial: ["kaku"], note: NI_PARTIAL }]));

export const YURE: Record<string, Yure> = {
  // 格助詞と接続助詞の両説（訳も「〜うちに・〜ところに・〜と・〜ときに」と両方に読める。2026-10-13 論文照合で一般論・繰り返し・手がかりなしの6か所を追加）
  ...both(
    "d690cbed04:s1-t13", // 大納言殿参りたまひて　奏したまふに、
    "d690cbed04:s3-t9", // 大納言殿参りたまひて　念じてさぶらふに、
    "d690cbed04:s12-t19", // 大納言殿参りたまひて　尋ねさせたまふに、
    "a2bfd6cb02:s6-t12", // 源氏の五十余巻　めづらしがりて、帰るに、
    "4106a08dfe:s3-t6", // あだし野　命あるものを見るに、（一般論の前置き）
    "ec2159c6e8:s12-t8", // かぐや姫の生い立ち　竹を取るに、（取るたびに＝繰り返し）
    "ec2159c6e8:s12-t20", // かぐや姫の生い立ち　竹取るに、
    "a2bfd6cb02:s5-t39", // 源氏の五十余巻　思ひ嘆かるるに、（接続助詞の手がかりなし）
    "a2bfd6cb02:s11-t37", // 源氏の五十余巻　いみじきことに思ふに、
    "61ad02e1df:s1-t94", // 雲林院にて　申し合はせばやと思ふに、
  ),
  // 格助詞（行き着く先）。接続助詞を選んだら △
  ...partialSetsuzoku(
    "3d0d7bf6ee:s2-t21", // 芥川　いと暗きに来けり
  ),
  // 単純接続（〜すると・〜ところ）の接続助詞。格助詞を選んだら △
  ...partialKaku(
    "f7aee682ff:s1-t199", // 花山院の出家　出でさせたまひけるに、
    "a2a8093ed5:s2-t8", // 土佐日記（帰京）　門に入るに、
    "3d0d7bf6ee:s6-t12", // 芥川　ゐたりけるに、
    "61ad02e1df:s1-t46", // 雲林院にて　見はべりしに、
    "bfa5b23cf2:s2-t30", // 東下り（宇津の山）　すずろなるめを見ることと思ふに、
    "9f6b6f2e95:s4-t34", // ちごのそらね　待ちけるに、
    "9f6b6f2e95:s5-t12", // ちごのそらね　待ちゐたるに、
    "chigo-no-sorane:s5-t15", // ちごのそらね　待ちけるに、
    "chigo-no-sorane:s7-t12", // ちごのそらね　待ちゐたるに、
    "acc9bf4496:s4-t13", // 花は盛りに　花見にまかれりけるに、
    "ec2159c6e8:s5-t6", // かぐや姫の生い立ち　寄りて見るに、
    "e9846f4330:s1-t145", // 仏の御石の鉢　あやしがりて見るに、
    "e9846f4330:s4-t8", // 仏の御石の鉢　光やあると見るに、
    "1af601c3ea:s3-t22", // 東下り（都鳥）　わびあへるに、
  ),
};

export type Verdict = "correct" | "partial" | "wrong";

export function yureOf(textId: string, target: ShikibetsuTarget): Yure | undefined {
  return YURE[`${textId}:${target.id}`];
}

/** 選んだ答えの判定。揺れの指定があれば、両方正解・△ を反映する */
export function judgeShikibetsu(target: ShikibetsuTarget, chosen: string, yure?: Yure): Verdict {
  if (chosen === target.answer || yure?.both?.includes(chosen)) return "correct";
  if (yure?.partial?.includes(chosen)) return "partial";
  return "wrong";
}
