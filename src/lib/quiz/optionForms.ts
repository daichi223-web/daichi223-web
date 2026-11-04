/**
 * 選択肢（訳）の活用を例文に合わせる（2026-11-05 ユーザー指示「訳なので、例文の活用に基本合わせる」）。
 *
 * 正解: 出している例文の訳の穴（〔 〕）の言葉。例「万の事も、始め終りこそをかしけれ」→〔おもしろい〕
 * 誤答: 正解の言葉が辞書の形（senseNorm）からどの活用形になっているかを調べ、誤答の辞書の形を同じ活用形にする。
 *       例 正解「気がかりだ→気がかりな」（連体）なら、誤答「窮屈だ→窮屈な」「暗い所のない」…
 *       活用形が分からない・変えられない語は null（呼び出し側が従来の文字に戻す）。
 *
 * 現代語の活用だけを扱う（形容詞・形容動詞・動詞の主な形）。純粋関数。
 */

export type FormId = 'shushi' | 'rentai' | 'renyo' | 'renyoTa' | 'mizen' | 'katei';
const FORMS: FormId[] = ['shushi', 'rentai', 'renyoTa', 'renyo', 'mizen', 'katei'];

type Cls = 'i' | 'na' | 'ichidan' | 'godan' | 'suru';

const I_DAN = 'いきぎしじちぢにひびぴみりゐ';
const E_DAN = 'えけげせぜてでねへべぺめれゑ';
// 「い段・え段＋る」でも五段の語（この単語帳の訳に出てくるもの中心）
const GODAN_RU = [
  '参る', 'まいる', '入る', 'はいる', '知る', '切る', '帰る', '走る', '要る', '散る', '照る', '限る', '茂る',
  '減る', '焦る', '遮る', '罵る', '嘲る', '陥る', '覆る', '侮る', '捻る', '握る', '滑る', '練る', '湿る', '混じる',
  '交じる', 'しゃべる', '喋る', 'ねじる', 'いじる', 'せびる', '蹴る',
];
// 漢字1字＋る の一段（それ以外の 漢字＋る は五段：祈る・座る・守る・移る・去る…）
const ICHIDAN_KANJI_RU = ['似る', '見る', '寝る', '着る', '煮る', '出る', '得る', '経る', '干る', '居る', '射る', '鋳る'];
// ます形が「い」になる敬語の五段
const HONORIFIC_I = ['いらっしゃる', 'おっしゃる', 'なさる', 'くださる', 'ござる'];

const ROW: Record<string, { a: string; i: string; e: string; ta: string }> = {
  う: { a: 'わ', i: 'い', e: 'え', ta: 'っ' },
  く: { a: 'か', i: 'き', e: 'け', ta: 'い' },
  ぐ: { a: 'が', i: 'ぎ', e: 'げ', ta: 'い' },
  す: { a: 'さ', i: 'し', e: 'せ', ta: 'し' },
  つ: { a: 'た', i: 'ち', e: 'て', ta: 'っ' },
  ぬ: { a: 'な', i: 'に', e: 'ね', ta: 'ん' },
  ぶ: { a: 'ば', i: 'び', e: 'べ', ta: 'ん' },
  む: { a: 'ま', i: 'み', e: 'め', ta: 'ん' },
  る: { a: 'ら', i: 'り', e: 'れ', ta: 'っ' },
};

function classify(dict: string): Cls | null {
  if (!dict) return null;
  if (dict.endsWith('する')) return 'suru';
  if (dict.endsWith('だ')) return 'na';
  if (dict.endsWith('い') && dict.length >= 2) return 'i';
  const last = dict.slice(-1);
  if (last === 'る') {
    if (dict.endsWith('来る') || dict.endsWith('くる')) return null; // カ変は扱わない
    if (GODAN_RU.some((g) => dict.endsWith(g)) || HONORIFIC_I.some((g) => dict.endsWith(g))) return 'godan';
    if (ICHIDAN_KANJI_RU.some((g) => dict.endsWith(g))) return 'ichidan';
    const prev = dict.slice(-2, -1);
    if (I_DAN.includes(prev) || E_DAN.includes(prev)) return 'ichidan';
    return 'godan';
  }
  if (ROW[last]) return 'godan';
  return null;
}

/** 辞書の形 dict を活用形 form にする。できなければ null */
export function conjugate(dict: string, form: FormId): string | null {
  const cls = classify(dict);
  if (!cls) return null;
  const stem = dict.slice(0, -1);
  switch (cls) {
    case 'i':
      return { shushi: dict, rentai: dict, renyo: stem + 'く', renyoTa: stem + 'かっ', mizen: stem + 'く', katei: stem + 'けれ' }[form];
    case 'na':
      return { shushi: dict, rentai: stem + 'な', renyo: stem + 'に', renyoTa: stem + 'だっ', mizen: stem + 'で', katei: stem + 'なら' }[form];
    case 'suru': {
      const s = dict.slice(0, -2);
      return { shushi: dict, rentai: dict, renyo: s + 'し', renyoTa: s + 'し', mizen: s + 'し', katei: s + 'すれ' }[form];
    }
    case 'ichidan':
      return { shushi: dict, rentai: dict, renyo: stem, renyoTa: stem, mizen: stem, katei: stem + 'れ' }[form];
    case 'godan': {
      const last = dict.slice(-1);
      const r = ROW[last];
      if (!r) return null;
      const honor = HONORIFIC_I.some((g) => dict.endsWith(g));
      const ta = dict.endsWith('行く') || dict.endsWith('いく') ? 'っ' : r.ta;
      return {
        shushi: dict,
        rentai: dict,
        renyo: stem + (honor ? 'い' : r.i),
        renyoTa: stem + ta,
        mizen: stem + r.a,
        katei: stem + r.e,
      }[form];
    }
  }
}

/** senseNorm から活用させる見出しの形を取り出す。最初の言い方・前の（ ）は残し、後ろの注記（謙譲・本動詞 など）は外す */
export function baseForm(senseNorm: string | undefined): { prefix: string; core: string } | null {
  if (!senseNorm) return null;
  // 最初の言い方。括弧の中の「・」（丁寧・本動詞 など）では区切らない
  let depth = 0;
  let cut = senseNorm.length;
  for (let i = 0; i < senseNorm.length; i++) {
    const ch = senseNorm[i];
    if (ch === '（' || ch === '(') depth++;
    else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && '・／/、'.includes(ch)) {
      cut = i;
      break;
    }
  }
  const first = senseNorm.slice(0, cut).trim();
  const noTail = first.replace(/[（(][^（）()]*[）)]$/, '').trim();
  const m = noTail.match(/^((?:[（(][^（）()]*[）)])*)(.*)$/);
  const prefix = m?.[1] ?? '';
  const core = (m?.[2] ?? noTail).trim();
  return core ? { prefix, core } : null;
}

/** 訳の穴の言葉（〔 〕の中）。複数あれば「～」でつなぐ。無ければ null */
export function translationBlank(translation: string | undefined): string | null {
  const parts = [...(translation ?? '').matchAll(/〔\s*(.+?)\s*〕/g)].map((m) => m[1].trim()).filter(Boolean);
  return parts.length ? parts.join('～') : null;
}

/** 最後の訳の穴の直後の文字列（活用形の手がかり。た・て・ず・ます・。など） */
export function textAfterBlank(translation: string | undefined): string {
  const t = translation ?? '';
  const i = t.lastIndexOf('〕');
  return i < 0 ? '' : t.slice(i + 1).replace(/^\s+/, '');
}

// 直後がこれで始まれば終止形（文末・助詞）。それ以外の語が続けば連体形
const SHUSHI_NEXT = /^($|[。、」』！？!?…―]|よ|ね|ぞ|か|と|が|けれど|し[、。]|から|まで|な[。」]|らしい|だろう|でしょう)/;

/** 訳の穴の言葉と直後の文字から活用形を決める（辞書の形と言い方が違う訳のとき） */
function inferForm(cls: Cls | null, blank: string, after: string): FormId | null {
  if (/[っん]$/.test(blank) && /^[たてだで]/.test(after)) return 'renyoTa';
  if (/^(ず|ない|なかっ|ぬ|れる|られ|せる|させ)/.test(after)) return 'mizen';
  if (/^(ます|まし|ながら|に行|に来)/.test(after)) return 'renyo';
  if (/^ば/.test(after)) return 'katei';
  if (cls === 'i' || /[しい]い$|い$/.test(blank) && cls !== 'na') {
    if (/かっ$/.test(blank)) return 'renyoTa';
    if (/く$/.test(blank) && cls === 'i') return 'renyo';
    if (/けれ$/.test(blank)) return 'katei';
    if (/い$/.test(blank)) return SHUSHI_NEXT.test(after) ? 'shushi' : 'rentai';
  }
  if (cls === 'na' || /[なだ]$/.test(blank)) {
    if (/な$/.test(blank)) return 'rentai';
    if (/だ$/.test(blank)) return 'shushi';
    if (/だっ$/.test(blank)) return 'renyoTa';
    if (/に$/.test(blank) && cls === 'na') return 'renyo';
  }
  if (/の$/.test(blank)) return 'rentai';
  if (/[うくぐすつぬぶむる]$/.test(blank)) return SHUSHI_NEXT.test(after) ? 'shushi' : 'rentai';
  if (/[たてだで]/.test(after.slice(0, 1)) && /[いきぎしちにびみりえけげせてねべめれ]$/.test(blank)) return 'renyoTa';
  return null;
}

/**
 * 正解の言葉 blank が、辞書の形 senseNorm のどの活用形か。分からなければ null。
 * after は訳の穴の直後の文字列（終止形と連体形の区別、言い方が違う訳のときの手がかり）。
 */
export function detectForm(senseNorm: string | undefined, blank: string, after = ''): FormId | null {
  const b = baseForm(senseNorm);
  const bare = blank.replace(/[（(][^（）()]*[）)]/g, '').trim();
  if (b) {
    // 形が同じになる活用形が複数あるときは FORMS の順（終止を先）で決める
    for (const f of FORMS) {
      const c = conjugate(b.core, f);
      if (c && (bare === c || bare.endsWith(c))) {
        if (f === 'shushi' && !SHUSHI_NEXT.test(after)) return 'rentai';
        return f;
      }
    }
  }
  return inferForm(b ? classify(b.core) : null, bare, after);
}

export type OptionWord = { qid: string; sense?: string; senseNorm?: string };

/**
 * 例文に合わせた選択肢の文字。戻り値は qid → 文字（決められない qid は入れない＝呼び出し側の既定の文字）。
 *   正解: 例文の訳の穴の言葉
 *   誤答: 正解と同じ活用形にした辞書の形（前の（ ）は残す）。重なる文字になるものは入れない
 */
export function exampleFittedLabels(
  options: OptionWord[],
  correct: OptionWord,
  exampleTranslation: string | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  const blank = translationBlank(exampleTranslation);
  if (!blank) return out;
  out[correct.qid] = blank;
  const form = detectForm(correct.senseNorm, blank, textAfterBlank(exampleTranslation));
  if (!form) return out;
  const used = new Set([blank]);
  for (const o of options) {
    if (o.qid === correct.qid) continue;
    const b = baseForm(o.senseNorm);
    if (!b) continue;
    // 活用しない語（副詞・名詞・「けしからん」など）はそのまま。活用する語は同じ活用形に
    const c = classify(b.core) ? conjugate(b.core, form) : b.core;
    if (!c) continue;
    const label = b.prefix + c;
    if (used.has(label)) continue;
    used.add(label);
    out[o.qid] = label;
  }
  return out;
}
