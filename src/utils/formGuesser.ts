/**
 * 左語の活用形推定（未然/連用/終止/連体/已然/命令）
 * 粗い推定：形容詞優先 → 動詞、文法データも参照
 */
import { loadGrammar } from "../lib/grammarLoader";

export type Form =
  | "未然形"
  | "連用形"
  | "終止形"
  | "連体形"
  | "已然形"
  | "命令形"
  | "不明";

/**
 * 形容詞の活用形を推定（ク/シク活用）
 */
export function guessAdjectiveForm(surface: string): Form {
  // シク活用を先に判定する。「悲しく」は未然形の「く」ではなく連用形。
  if (/しく$|しかり$/.test(surface)) return "連用形";
  if (/しから$/.test(surface)) return "未然形";
  // ク活用
  if (/く$|から$/.test(surface)) return "未然形";
  if (/かり$/.test(surface)) return "連用形";
  if (/し$/.test(surface)) return "終止形";
  if (/き$|かる$/.test(surface)) return "連体形";
  if (/けれ$/.test(surface)) return "已然形";
  if (/かれ$/.test(surface)) return "命令形";
  if (/しき$|しかる$/.test(surface)) return "連体形";
  if (/しけれ$/.test(surface)) return "已然形";
  if (/しかれ$/.test(surface)) return "命令形";

  return "不明";
}

/**
 * 動詞の活用形を推定（四段・上一・下一・カ変・サ変・ナ変・ラ変）
 */
export function guessVerbForm(surface: string): Form {
  const grammar = loadGrammar();

  // カ変「来」
  if (/こ$/.test(surface)) return "未然形";
  if (/き$/.test(surface)) return "連用形";
  if (/く$/.test(surface)) return "終止形";
  if (/くる$/.test(surface)) return "連体形";
  if (/くれ$/.test(surface)) return "已然形";
  if (/こよ$/.test(surface)) return "命令形";

  // サ変「す」
  if (/せ$|し$|す$/.test(surface)) return "未然形";
  if (/し$/.test(surface)) return "連用形";
  if (/す$/.test(surface)) return "終止形";
  if (/する$/.test(surface)) return "連体形";
  if (/すれ$/.test(surface)) return "已然形";
  if (/せよ$/.test(surface)) return "命令形";

  // ナ変「死ぬ」
  if (/な$/.test(surface)) return "未然形";
  if (/に$/.test(surface)) return "連用形";
  if (/ぬ$/.test(surface)) return "終止形";
  if (/ぬる$/.test(surface)) return "連体形";
  if (/ぬれ$/.test(surface)) return "已然形";
  if (/ね$/.test(surface)) return "命令形";

  // ラ変「あり」
  if (/ら$/.test(surface)) return "未然形";
  if (/り$/.test(surface)) return "連用形";
  if (/り$/.test(surface)) return "終止形";
  if (/る$/.test(surface)) return "連体形";
  if (/れ$/.test(surface)) return "已然形";
  if (/れ$/.test(surface)) return "命令形";

  // 四段
  if (/[あわかがさざただなはばまやらわ]$/.test(surface)) return "未然形";
  if (/[いきぎしじちぢにひびみりゐ]$/.test(surface)) return "連用形";
  if (/[うくぐすずつづぬふぶむゆるう]$/.test(surface)) return "終止形";
  if (/[うくぐすずつづぬふぶむゆるう]$/.test(surface)) return "連体形"; // 終止形と同形
  if (/[えけげせぜてでねへべめれゑ]$/.test(surface)) return "已然形";

  // 上一・下一（ざっくり）
  if (/[みきぎにひび]$/.test(surface)) return "連用形";
  if (/[みる|きる|ぎる|にる|ひる|びる]$/.test(surface)) return "連体形";
  if (/[みれ|きれ|ぎれ|にれ|ひれ|びれ]$/.test(surface)) return "已然形";

  return "不明";
}

/**
 * 左形を推定（形容詞優先）
 */
export function guessLeftForm(surface: string): Form {
  // 形容詞パターンを優先（「悲しき」「美しき」など）
  const adjForm = guessAdjectiveForm(surface);
  if (adjForm !== "不明") return adjForm;

  // 動詞パターン
  const verbForm = guessVerbForm(surface);
  if (verbForm !== "不明") return verbForm;

  return "不明";
}

/**
 * 右文脈が名詞的か（「こと/もの/人/所」や漢字開始など）
 */
export function isNounLike(right: string): boolean {
  if (!right || right.trim() === "") return false;
  const trimmed = right.trim();

  // 典型的な形式名詞
  if (/^(こと|もの|人|所|者|時|方|由)/.test(trimmed)) return true;

  // 漢字開始
  if (/^[一-龯]/.test(trimmed)) return true;

  // 体言止め（句末で名詞的）
  if (/^(なり|たり)$/.test(trimmed)) return true;

  return false;
}

/**
 * 文末の述語から結びの形を推定
 */
export function guessResultingForm(endingSurface: string): Form {
  if (/(かる|しかる)$/.test(endingSurface)) return "連体形";
  if (/けれ$/.test(endingSurface)) return "已然形";
  if (/き$/.test(endingSurface)) return "連体形";
  // 連体形パターン（「〜る」「〜くる」「〜する」など）
  if (/[るくすぬ]る$/.test(endingSurface)) return "連体形";

  // 已然形パターン（「〜ば」「〜ども」「〜れ」など）
  if (/[ればけめれどもども]$/.test(endingSurface)) return "已然形";

  // 終止形（デフォルト）
  return "終止形";
}
