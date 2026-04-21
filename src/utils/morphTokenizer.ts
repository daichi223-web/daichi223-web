/**
 * morphTokenizer.ts - 形態素トークナイザー（完全安全版）
 *
 * 古文の形態素解析を行い、語幹と付属語（助動詞・助詞）を分離
 * TDZ対策: すべてlazy initialization、export function、入力検証
 */

import { normalizeSense } from "./normalizeSense";

export type Morpheme =
  | { pos: "content"; surface: string; lemma: string }
  | { pos: "aux"; tag: string; surface: string }
  | { pos: "prt"; tag: string; surface: string };

export interface TokenizeOptions {
  /** 助詞を照合で無視する（推奨: true） */
  ignoreParticles?: boolean;
  /** 助動詞は部分集合を許容する（受身+完了 vs 受身のみ など） */
  allowAuxSubset?: boolean;
}

/** 助動詞・接続助詞（終止形代表タグ）。現代語「ない」も打消として吸収。 */
let auxRulesCache: Array<{ re: RegExp; tag: string }> | null = null;
function getAuxRules(): Array<{ re: RegExp; tag: string }> {
  if (auxRulesCache) return auxRulesCache;
  auxRulesCache = [
    // 接続助詞（最長一致の原則：複合形を先に評価）
    { re: /ないで$/u, tag: "打消-接続" },
    { re: /ずして$/u, tag: "打消-接続" },
    { re: /くて$/u, tag: "形容詞-接続" },
    { re: /(て|で)$/u, tag: "接続" },  // 「座って」「見て」「読んで」など

    // 助動詞
    { re: /(ず|ぬ|ざり|じ|ない)$/u, tag: "打消" },
    { re: /(つ|ぬ|たり)$/u, tag: "完了-存続" },  // 「り」は動詞語尾と曖昧なので除外
    { re: /(けり|き|けむ|けん)$/u, tag: "過去" },
    { re: /(む|らむ|べし|べき|べく|まじ)$/u, tag: "推量" },
    { re: /(なり|めり)$/u, tag: "推定" },
    { re: /ている$/u, tag: "存続" },  // 現代語の吸収
    { re: /れる$/u, tag: "可能" },   // ら抜き言葉の吸収
    { re: /(らる|る)$/u, tag: "る・らる" },
    { re: /(さす|しむ|す)$/u, tag: "使役" },

    // 連用形音便も接続の機能を持つ（「座っ」=「座って」の「て」省略形）
    // ただし、これは語幹の一部とも解釈できるため、慎重に扱う
    // 現在の設計では、toContentMorphemeで語幹抽出時に処理する
  ];
  return auxRulesCache;
}

/** 助詞の揺れをタグに正規化（必要に応じて拡張） */
let particleRulesCache: Array<{ re: RegExp; tag: string }> | null = null;
function getParticleRules(): Array<{ re: RegExp; tag: string }> {
  if (particleRulesCache) return particleRulesCache;
  particleRulesCache = [
    { re: /(は|わ)$/u, tag: "係助:は" },
    { re: /(も)$/u, tag: "係助:も" },
    { re: /(ぞ|なむ|や|か)$/u, tag: "係助:係り結び" },
    { re: /(を)$/u, tag: "格助:を" },
    { re: /(に)$/u, tag: "格助:に" },
    { re: /(へ)$/u, tag: "格助:へ" },
    { re: /(が)$/u, tag: "格助:が" },
    { re: /(より)$/u, tag: "格助:より" },
    { re: /(まで)$/u, tag: "格助:まで" },
    { re: /(して|にて)$/u, tag: "格助:して" },   // して/にて を同一視
    { re: /(ども|ど|が)$/u, tag: "接続:逆接" },  // ど/ども/が を同一視
    { re: /(こそ)$/u, tag: "係助:こそ" },
  ];
  return particleRulesCache;
}

/** 動詞：終止形にざっくり寄せる（四段・上一・下一・カ/サ/ラ変） */
let verbReverseCache: Array<{ re: RegExp; to: string }> | null = null;
function getVerbReverse(): Array<{ re: RegExp; to: string }> {
  if (verbReverseCache) return verbReverseCache;
  verbReverseCache = [
    { re: /(こよ|くれ|くる|く|き|こ)$/u, to: "くる" },  // カ変「来」
    { re: /(せよ|すれ|する|す|し|せ)$/u, to: "する" },  // サ変「す」
    { re: /(あり|をり|侍り|はべり)$/u, to: "あり" },    // ラ変代表寄せ
    { re: /(い|いて|いたり|いぬ|いる|ゐる)$/u, to: "いる" }, // 上一ざっくり
    { re: /(え|えて|えば|えども|えぬ|えたり)$/u, to: "う" },  // 下一ざっくり
    // 連用形音便: 「っ」「ん」「い」は接続の機能を持つが、ここでは語幹抽出のみ
    // 接続タグの付与はpeelAuxiliariesで行う（「て/で」と統一）
    { re: /(っ|ん|い)$/u, to: "る" },  // 連用形音便（座っ→座る、読ん→読む、買い→買う）
    { re: /り$/u, to: "る" },  // 連用形「り」（祈り→祈る、切り→切る）
    { re: /(わ|う|え|お)$/u, to: "う" },  // 四段未然・連用
  ];
  return verbReverseCache;
}

/** 形容詞：終止形（い/しい） */
let adjReverseCache: Array<{ re: RegExp; to: string }> | null = null;
function getAdjReverse(): Array<{ re: RegExp; to: string }> {
  if (adjReverseCache) return adjReverseCache;
  adjReverseCache = [
    { re: /(く|き|けれ|から|かり|かる)$/u, to: "い" },        // ク活用
    { re: /(しく|しき|しけれ|しから|しかり|しかる)$/u, to: "しい" }, // シク活用
  ];
  return adjReverseCache;
}

/** 形容動詞（タリ/ナリ）→ 代表「なり」に寄せる */
let adjNariReverseCache: Array<{ re: RegExp; to: string }> | null = null;
function getAdjNariReverse(): Array<{ re: RegExp; to: string }> {
  if (adjNariReverseCache) return adjNariReverseCache;
  adjNariReverseCache = [
    { re: /(なり|に|なる|なれ|な)$/u, to: "なり" },
    { re: /(たり|と|たる|たれ|た)$/u, to: "なり" },
  ];
  return adjNariReverseCache;
}

/** 末尾から助詞束を吸収（複数連続もあり得る） */
function peelParticles(x: string) {
  const prts: Morpheme[] = [];
  let progress = true;
  const PARTICLE_RULES = getParticleRules();
  while (progress) {
    progress = false;
    for (const rule of PARTICLE_RULES) {
      const m = x.match(rule.re);
      if (m) {
        prts.push({ pos: "prt", tag: rule.tag, surface: m[0] });
        x = x.slice(0, x.length - m[0].length);
        progress = true;
        break;
      }
    }
  }
  return { stem: x, prts };
}

/** 末尾から助動詞を吸収（複合可） */
function peelAuxiliaries(x: string) {
  const aux: Morpheme[] = [];
  let progress = true;
  let hasContent = false; // 自立語（内容語）を検出したか
  const AUX_RULES = getAuxRules();

  while (progress) {
    progress = false;
    for (const rule of AUX_RULES) {
      const m = x.match(rule.re);
      if (m) {
        // まだ自立語が残っている場合は助動詞として抽出
        // 自立語がなく助動詞のみの場合は、それは動詞の一部
        const remaining = x.slice(0, x.length - m[0].length);

        // 残りが空、または助動詞・助詞のみの場合、これは動詞の語尾
        if (!remaining || remaining.length < 2) {
          // 自立語がない = 動詞の活用語尾
          hasContent = true;
          break;
        }

        aux.push({ pos: "aux", tag: rule.tag, surface: m[0] });
        x = x.slice(0, x.length - m[0].length);
        progress = true;
        break;
      }
    }
  }
  return { stem: x, aux };
}

/** 残幹を辞書形へ寄せて内容語 morpheme を作る */
function toContentMorpheme(stem0: string): Morpheme {
  let stem = stem0;
  let changed = false;
  const VERB_REVERSE = getVerbReverse();
  const ADJ_REVERSE = getAdjReverse();
  const ADJ_NARI_REVERSE = getAdjNariReverse();

  for (const r of VERB_REVERSE) {
    if (r.re.test(stem)) {
      stem = stem.replace(r.re, r.to);
      changed = true;
      break;
    }
  }
  if (!changed) {
    for (const r of ADJ_REVERSE) {
      if (r.re.test(stem)) {
        stem = stem.replace(r.re, r.to);
        changed = true;
        break;
      }
    }
  }
  if (!changed) {
    for (const r of ADJ_NARI_REVERSE) {
      if (r.re.test(stem)) {
        stem = stem.replace(r.re, r.to);
        changed = true;
        break;
      }
    }
  }

  return { pos: "content", surface: stem0, lemma: stem };
}

/** 記述解答(sense)を形態素列へ（助詞/助動詞タグ化、敬語はプレフィクスで扱う） */
export function tokenizeSense(
  surface: string,
  opts: TokenizeOptions = { ignoreParticles: true, allowAuxSubset: true }
): Morpheme[] {
  // 入力検証
  if (!surface || typeof surface !== 'string') {
    return [{ pos: "content", surface: "", lemma: "" }];
  }

  let x = '';
  try {
    x = normalizeSense(surface);
  } catch (e) {
    console.warn("normalizeSense error in tokenizeSense:", e);
    x = surface;
  }

  if (!x) {
    return [{ pos: "content", surface: "", lemma: "" }];
  }

  // 敬語プレフィクス（お/ご）を評価対象にする：削除しない、タグ化する
  const honorific = /^(お|ご)(?=[ぁ-ゖ一-龯])/u.test(x);

  // 助動詞→助詞の順にむしり取り（助動詞を先に剥がすことで「で」等の誤分類を防止）
  const { stem: afterAux, aux } = peelAuxiliaries(x);
  const { stem: afterPrt, prts } = peelParticles(afterAux);

  // 連用形音便の検出（「座っ」「読ん」「買い」など）
  // これらは「て」「で」と同じ接続機能を持つ
  const hasRenyoOnbin = /(っ|ん|い)$/u.test(afterPrt);

  const content = toContentMorpheme(afterPrt);
  const seq: Morpheme[] = [content, ...aux];

  // 連用形音便があり、かつまだ接続タグがない場合のみ追加（「座っ」=「座って」）
  const hasConnectionTag = aux.some(a => {
    if (a.pos === "aux") {
      return a.tag === "接続" || a.tag.includes("接続");
    }
    return false;
  });
  if (hasRenyoOnbin && !hasConnectionTag) {
    seq.push({ pos: "aux", tag: "接続", surface: "（連用形音便）" });
  }

  if (honorific) {
    seq.push({ pos: "aux", tag: "尊敬", surface: "お/ご(敬語)" });
  }
  if (!opts.ignoreParticles) seq.push(...prts);
  return seq;
}

/** 照合用キー（助詞無視/助動詞集合化） */
export function morphKey(
  surface: string,
  opts: TokenizeOptions = { ignoreParticles: true, allowAuxSubset: true }
) {
  // 入力検証
  if (!surface || typeof surface !== 'string') {
    return {
      key: '',
      content: { pos: "content" as const, surface: "", lemma: "" },
      aux: []
    };
  }

  try {
    const tokens = tokenizeSense(surface, opts);
    const content = tokens.find(t => t.pos === "content") as Extract<Morpheme, {pos:"content"}>;

    if (!content) {
      return {
        key: '',
        content: { pos: "content" as const, surface: "", lemma: "" },
        aux: []
      };
    }

    const aux = tokens.filter(t => t.pos === "aux").map(t => (t as any).tag as string).sort();
    const key = aux.length ? `${content.lemma}|${aux.join("+")}` : content.lemma;
    return { key, content, aux };
  } catch (e) {
    console.warn("morphKey error:", e);
    return {
      key: '',
      content: { pos: "content" as const, surface: "", lemma: "" },
      aux: []
    };
  }
}
