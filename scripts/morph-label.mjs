/**
 * 品詞分解のラベル（表の2列目の表示名）を読み解く。
 *
 * 正本の表には wikilink を張らない素のテキストのセルが 7,392件（360種）ある。
 * 変換器はそれを「最初の区切りをそのまま品詞名にする」だけで扱っていたため、
 * 「ヤ下二・用」→ pos="ヤ下二"、「命令・終」→ pos="命令" のように、
 * 活用の種類や助動詞の意味が品詞欄に入ってしまっていた（528件）。
 *
 * ここでは、リンクの有無によらずラベルの形から意味を取る。
 * 語彙（助動詞の意味・助詞の略記・活用の種類）は正本の実データから拾ったもの。
 */

/** 助動詞の意味（正本のリンク付きセルに実在する34種） */
export const JODOSHI_MEANINGS = new Set([
  '過去', '完了', '打消', '断定', '存続', '尊敬', '推量', '意志', '婉曲', '受身',
  '使役', '当然', '強意', '詠嘆', '可能', '過去推量', '自発', '打消推量', '推定',
  '比況', '適当', '反実仮想', '打消意志', '仮定', '存在', '伝聞', '過去伝聞',
  '打消当然', '希望', '願望', '現在推量', '不可能', '完了体', '過去の原因推量',
  // 素のセルにだけ出るもの（略記や、正本の書き方の揺れ）
  '命令', '意思', '原因推量', '打消仮定', '現推', '禁止', '例示',
]);

/** 助詞の略記 → 品詞名 */
export const JOSHI_POS = {
  格助: '格助詞', 接助: '接続助詞', 係助: '係助詞', 副助: '副助詞',
  終助: '終助詞', 間助: '間投助詞', 間投: '間投助詞', 準体: '準体助詞',
};

/** その他の略記 → 品詞名 */
export const PLAIN_POS = {
  副: '副詞', 代: '代名詞', 代名: '代名詞', 感: '感動詞', 接: '接続詞', 連体: '連体詞',
  連語: '連語', 接頭: '接頭語', 接尾: '接尾語', 記号: '記号', 数副: '数副詞',
  枕: '枕詞', 名: '名詞',
};

/** 用言の活用の種類か（ラ四・ヤ下二・サ変・ク・シク・ナリ など） */
const CONJ_TYPE = /^(?:[ラカサタナハバマヤワアガダザパ](?:四|上一|上二|下一|下二)|[カサナラ]変|ク|シク|ナリ|タリ|カリ)$/;

const bare = (seg) => (seg || '').replace(/[（(].*$/, '').replace(/[\s\u3000]/g, '');

/** 用言の活用の種類から品詞を決める */
export function posFromConjType(ct) {
  if (!ct) return '';
  if (/^(ク|シク|カリ)$/.test(ct)) return '形容詞';
  if (/^(ナリ|タリ)$/.test(ct)) return '形容動詞';
  return '動詞';
}

/**
 * ラベルを読み解いて grammarTag の中身を返す。
 * 読み解けないときは { pos: '' } を返す（勝手な品詞名を作らない）。
 */
export function parseLabel(display) {
  const t = (display || '').trim();
  if (!t) return { pos: '' };

  const honorific = /[（(][^）)]*尊[^）)]*[）)]/.test(t) ? '尊敬'
    : /[（(][^）)]*謙[^）)]*[）)]/.test(t) ? '謙譲' : undefined;

  // 「（接頭）」「（接尾）」「（連語）」だけのセル
  const only = t.match(/^[（(](接頭|接尾|連語|複)[）)]$/);
  if (only) return { pos: PLAIN_POS[only[1]] || (only[1] === '複' ? '' : only[1]) };

  // 先頭の「（複）」は複合語の印なので落とす
  const body = t.replace(/^[（(]複[）)]/, '');
  const segs = body.split('・');
  const b0 = bare(segs[0]);

  const out = {};
  if (honorific) out.honorific = honorific;

  // 正本の書き方の揺れを吸収する（読むだけ。正本は check-morph が別に報告する）
  //   「補動ラ変・未」  … 補動 と活用の種類の間の ・ が抜けている
  //   「ク用（接尾）」   … 活用の種類と活用形の間の ・ が抜けている
  //   「カ・下二・未」   … 活用の種類の途中に ・ が入っている
  if (/^(補動|補助)./.test(b0) && CONJ_TYPE.test(b0.replace(/^(補動|補助)/, ''))) {
    segs.splice(0, 1, b0.slice(0, 2), b0.slice(2));
  } else if (/^(ク|シク|[ラカサタナハバマヤワアガダザパ](?:四|上一|上二|下一|下二))[未用終体已命]$/.test(b0)) {
    segs.splice(0, 1, b0.slice(0, -1), b0.slice(-1) + (segs[0].match(/[（(].*$/) || [''])[0]);
  } else if (segs.length >= 2 && CONJ_TYPE.test(b0 + bare(segs[1]))) {
    segs.splice(0, 2, b0 + bare(segs[1]));
  }
  const b1 = bare(segs[0]);

  // 補助動詞（補動・ハ四・体（尊））
  if (b1 === '補動' || b1 === '補助') {
    out.pos = '補助動詞';
    if (segs[1]) out.conjugationType = bare(segs[1]);
    if (segs[2]) out.conjugationForm = bare(segs[2]);
    return out;
  }
  // 用言（ヤ下二・用、ナリ（幹））
  if (CONJ_TYPE.test(b1)) {
    out.pos = posFromConjType(b1);
    out.conjugationType = b1;
    if (segs[1]) out.conjugationForm = bare(segs[1]);
    return out;
  }
  // 助動詞（現在推量・体、命令・終）
  if (JODOSHI_MEANINGS.has(b1)) {
    out.pos = '助動詞';
    out.meaning = b1;
    if (segs[1]) out.conjugationForm = bare(segs[1]);
    return out;
  }
  // 助詞（接助・単純、副助・例示）
  if (JOSHI_POS[b1]) {
    out.pos = JOSHI_POS[b1];
    const rest = segs.slice(1).map(bare).filter(Boolean).join('・');
    if (rest) out.meaning = rest;
    return out;
  }
  // その他の略記（副・代・感・接・連体…）
  if (PLAIN_POS[b1]) { out.pos = PLAIN_POS[b1]; return out; }

  // 読み解けない。品詞名を捏造せず空にする
  out.pos = '';
  return out;
}
