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

/** renyoDe = 文を続ける連用形（中止法）: 形容動詞「退屈で」・形容詞「寂しく」・動詞「〜し／〜き」 */
/** meirei = 命令形（〜ろ・五段は〜え段）、meireiYo = 文語調の命令（〜よ・〜せよ）、te = て形（〜て・〜で） */
export type FormId = 'shushi' | 'rentai' | 'renyo' | 'renyoTa' | 'renyoDe' | 'te' | 'mizen' | 'katei' | 'meirei' | 'meireiYo';
const FORMS: FormId[] = ['shushi', 'rentai', 'renyoTa', 'renyo', 'renyoDe', 'te', 'mizen', 'katei', 'meirei', 'meireiYo'];

type Cls = 'i' | 'na' | 'ichidan' | 'godan' | 'suru' | 'kuru';

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
// 「い」で終わる名詞（形容詞として活用させない）
const NOUN_I = ['願い', '思い', '遣い', '違い', '戦い', '争い', '匂い', '笑い', '祝い', '誓い', '迷い', '扱い', '住まい', '舞い', '構い', 'だいたい'];
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
  if (dict.endsWith('い') && dict.length >= 2) return NOUN_I.some((n) => dict.endsWith(n)) ? null : 'i';
  const last = dict.slice(-1);
  if (last === 'る') {
    if (dict.endsWith('来る')) return 'kuru'; // カ変（漢字表記だけ。かな書きの「くる」は 繰る 等と紛れるので扱わない）
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
      return { shushi: dict, rentai: dict, renyo: stem + 'く', renyoTa: stem + 'かっ', renyoDe: stem + 'く', te: stem + 'くて', mizen: stem + 'く', katei: stem + 'けれ', meirei: null, meireiYo: null }[form];
    case 'na':
      return { shushi: dict, rentai: stem + 'な', renyo: stem + 'に', renyoTa: stem + 'だっ', renyoDe: stem + 'で', te: stem + 'で', mizen: stem + 'で', katei: stem + 'なら', meirei: null, meireiYo: null }[form];
    case 'suru': {
      const s = dict.slice(0, -2);
      return { shushi: dict, rentai: dict, renyo: s + 'し', renyoTa: s + 'し', renyoDe: s + 'し', te: s + 'して', mizen: s + 'し', katei: s + 'すれ', meirei: s + 'しろ', meireiYo: s + 'せよ' }[form];
    }
    case 'kuru': {
      // 来る（くる）: 連用・未然とも漢字は「来」。読みの違い（き／こ）は表記に出ない
      const s = dict.slice(0, -1);
      return { shushi: dict, rentai: dict, renyo: s, renyoTa: s, renyoDe: s, te: s + 'て', mizen: s, katei: s + 'れ', meirei: s + 'い', meireiYo: s + 'よ' }[form];
    }
    case 'ichidan':
      return { shushi: dict, rentai: dict, renyo: stem, renyoTa: stem, renyoDe: stem, te: stem + 'て', mizen: stem, katei: stem + 'れ', meirei: stem + 'ろ', meireiYo: stem + 'よ' }[form];
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
        renyoDe: stem + (honor ? 'い' : r.i),
        te: stem + ta + ('ぐぬぶむ'.includes(last) ? 'で' : 'て'),
        mizen: stem + r.a,
        katei: stem + r.e,
        // 命令: 五段は え段（いらっしゃる 等は「い」）。文語調の「よ」は五段には無いので同じ形
        meirei: stem + (honor ? 'い' : r.e),
        meireiYo: stem + (honor ? 'い' : r.e),
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

/** 訳の穴の言葉（〔 〕の中）。複数あれば「～」でつなぐ（同じ言葉が2回なら1つ。「順序～順序」にしない）。無ければ null */
export function translationBlank(translation: string | undefined): string | null {
  const parts = [...(translation ?? '').matchAll(/〔\s*(.+?)\s*〕/g)].map((m) => m[1].trim()).filter(Boolean);
  const uniq = [...new Set(parts)];
  return uniq.length ? uniq.join('～') : null;
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
function inferForm(clsNorm: Cls | null, blank: string, after: string): FormId | null {
  // 辞書の形と訳の言葉で品詞が違うとき（親密だ→「親しい」）は訳の言葉の品詞で見る
  const own = classify(blank);
  const cls = own === 'i' || own === 'na' ? own : clsNorm;
  if (/[っん]$/.test(blank) && /^[たてだで]/.test(after)) return 'renyoTa';
  // 命令（文末で え段・ろ・よ）／て形（文末・読点の前の〜て・〜で）
  if (/^[。」』！!]/.test(after) || after === '') {
    if (/(せよ|よ)$/.test(blank) && own !== 'i') return 'meireiYo';
    if (/ろ$/.test(blank)) return 'meirei';
    if (/[てで]$/.test(blank) && own !== 'na') return 'te';
  }
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
    if (/で$/.test(blank) && cls === 'na') return 'renyoDe';
  }
  // 「〜ないで」「〜くて」で文を続ける形
  if (/(ないで|くて)$/.test(blank)) return 'renyoDe';
  if (/の$/.test(blank)) return 'rentai';
  if (/[うくぐすつぬぶむる]$/.test(blank)) return SHUSHI_NEXT.test(after) ? 'shushi' : 'rentai';
  if (/[たてだで]/.test(after.slice(0, 1)) && /[いきぎしちにびみりえけげせてねべめれ]$/.test(blank)) return 'renyoTa';
  // 活用しない言葉（とても・非常に・はっきり・平然として）が後ろの述語にかかる → 連用修飾（形容詞〜く・形容動詞〜に）
  if (!own && after && !/^[。、」』！？!?…のがをはへやもとでに]/.test(after)) return 'renyo';
  if (!own && /に$/.test(blank)) return 'renyo'; // 「むやみに、」のように読点が続く連用修飾
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
      // 「〜ている（補助）」の「〜」は照合では外す（訳の穴は「てい」）
      const c = conjugate(b.core, f)?.replace(/^[〜～]/, '');
      if (c && (bare === c || bare.endsWith(c))) {
        if (f === 'shushi' && !SHUSHI_NEXT.test(after)) return 'rentai';
        if (f === 'katei' && !/^ば/.test(after)) return /よ$/.test(bare) ? 'meireiYo' : 'meirei';
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
