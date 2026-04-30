/**
 * 助動詞・助詞の「接続」「活用型」を baseForm から逆引きするテーブル。
 * GrammarPopover で grammarTag に欠けているフィールドを補完するために使う。
 *
 * 校本・古典文法書 (高等学校古典文法) に基づく標準。
 */

export type AuxInfo = {
  conjugationType?: string; // 活用型 (例: ラ変型, 下二段型, 形容詞型, 特殊型)
  connection?: string;      // 接続 (例: 連用形, 未然形, 終止形(ラ変は連体形))
};

// 助動詞テーブル (baseForm キー)
export const AUXILIARY_INFO: Record<string, AuxInfo> = {
  // 過去
  き: { conjugationType: '特殊型 (せ/—/き/し/しか/—)', connection: '連用形' },
  けり: { conjugationType: 'ラ変型 (けら/—/けり/ける/けれ/—)', connection: '連用形' },
  // 完了・存続
  つ: { conjugationType: '下二段型', connection: '連用形' },
  ぬ: { conjugationType: 'ナ変型 (な/に/ぬ/ぬる/ぬれ/ね)', connection: '連用形' },
  たり: { conjugationType: 'ラ変型', connection: '連用形' },
  り: { conjugationType: 'ラ変型', connection: 'サ変未然・四段已然 (サ未四已)' },
  // 打消
  ず: { conjugationType: '特殊型 (ず/ざら、ず/ざり、ず、ぬ/ざる、ね/ざれ、—/ざれ)', connection: '未然形' },
  // 推量・意志
  む: { conjugationType: '四段型 (—/—/む/む/め/—)', connection: '未然形' },
  ん: { conjugationType: '四段型', connection: '未然形' },
  むず: { conjugationType: 'サ変型', connection: '未然形' },
  んず: { conjugationType: 'サ変型', connection: '未然形' },
  じ: { conjugationType: '無変化型', connection: '未然形' },
  まし: { conjugationType: '特殊型 (ましか・ませ/—/まし/まし/ましか/—)', connection: '未然形' },
  // 推量 (終止形接続、ラ変は連体形)
  らむ: { conjugationType: '四段型', connection: '終止形 (ラ変は連体形)' },
  らん: { conjugationType: '四段型', connection: '終止形 (ラ変は連体形)' },
  けむ: { conjugationType: '四段型', connection: '連用形' },
  けん: { conjugationType: '四段型', connection: '連用形' },
  べし: { conjugationType: '形容詞ク活用型', connection: '終止形 (ラ変は連体形)' },
  まじ: { conjugationType: '形容詞シク活用型', connection: '終止形 (ラ変は連体形)' },
  なり: { conjugationType: '形容動詞ナリ活用型', connection: '体言・連体形 (断定) / 終止形ラ変連体形 (伝聞推定)' },
  めり: { conjugationType: 'ラ変型', connection: '終止形 (ラ変は連体形)' },
  らし: { conjugationType: '無変化型', connection: '終止形 (ラ変は連体形)' },
  // 受身・尊敬・自発・可能
  る: { conjugationType: '下二段型', connection: '四段・ナ変・ラ変の未然形' },
  らる: { conjugationType: '下二段型', connection: '四段・ナ変・ラ変以外の未然形' },
  // 使役・尊敬
  す: { conjugationType: '下二段型', connection: '四段・ナ変・ラ変の未然形' },
  さす: { conjugationType: '下二段型', connection: '四段・ナ変・ラ変以外の未然形' },
  しむ: { conjugationType: '下二段型', connection: '未然形' },
  // 願望
  まほし: { conjugationType: '形容詞シク活用型', connection: '未然形' },
  たし: { conjugationType: '形容詞ク活用型', connection: '連用形' },
  // 断定
  // (なり・たり 断定は上記と同形だが用法別)
  ごとし: { conjugationType: '形容詞ク活用型', connection: '体言・連体形 (に「の」「が」を介して)' },
  // 比況
  ごとくなり: { conjugationType: '形容動詞ナリ活用型', connection: '体言・連体形' },
};

// 助詞テーブル (text キー、助詞は活用しないので connection のみ)
export const PARTICLE_CONNECTION: Record<string, string> = {
  // 接続助詞
  ば: '未然形 (仮定) / 已然形 (確定)',
  ど: '已然形',
  ども: '已然形',
  て: '連用形',
  して: '連用形',
  つつ: '連用形',
  ながら: '連用形 (動作の継続) / 体言・形容詞語幹 (逆接)',
  とも: '終止形 (形容詞は連用形)',
  ものを: '連体形',
  ものから: '連体形',
  ものゆゑ: '連体形',
  // 終助詞
  ばや: '未然形',
  なむ: '未然形 (他者願望) / 体言・連体形 (係助詞は別)',
  もがな: '体言・形容詞語幹',
  かな: '体言・連体形',
  かし: '文末',
  // 副助詞
  だに: '体言・連体形・副詞・助詞',
  さへ: '体言・連体形・副詞・助詞',
  すら: '体言・連体形',
  のみ: '体言・連体形・副詞',
  ばかり: '体言・連体形',
  まで: '体言・連体形',
  など: '体言・連体形・副詞',
  // 係助詞
  ぞ: '種々の語 (係結 → 連体形)',
  なん: '種々の語 (係結 → 連体形)',
  や: '種々の語 (係結 → 連体形)',
  か: '種々の語 (係結 → 連体形)',
  こそ: '種々の語 (係結 → 已然形)',
  // 格助詞は接続が単純なので省略 (体言/連体形に付くのみ)
};

/**
 * 略式の活用形 (終/体/用/未/已/命) を正式名に展開。
 */
export function normalizeConjugationForm(form: string): string {
  if (!form) return '';
  const map: Record<string, string> = {
    '未': '未然形',
    '用': '連用形',
    '終': '終止形',
    '体': '連体形',
    '已': '已然形',
    '命': '命令形',
  };
  return map[form] ?? form; // 既に正式名ならそのまま
}

/**
 * grammarTag が空・不完全なフィールドを補完して返す。
 */
export function enrichGrammarInfo(
  pos: string,
  text: string,
  baseForm: string | undefined,
  conjugationType: string | undefined,
  conjugationForm: string | undefined,
): {
  conjugationType: string | null;
  conjugationForm: string | null;
  connection: string | null;
} {
  let type = conjugationType ?? '';
  let form = conjugationForm ? normalizeConjugationForm(conjugationForm) : '';
  let connection = '';

  if (pos === '助動詞') {
    // baseForm 優先、なければ text で逆引き
    const aux = AUXILIARY_INFO[baseForm ?? ''] ?? AUXILIARY_INFO[text];
    if (aux) {
      if (!type && aux.conjugationType) type = aux.conjugationType;
      if (aux.connection) connection = aux.connection;
    }
  } else if (
    pos === '格助詞' || pos === '接続助詞' || pos === '係助詞' ||
    pos === '副助詞' || pos === '終助詞' || pos === '間投助詞' || pos === '助詞'
  ) {
    const c = PARTICLE_CONNECTION[text];
    if (c) connection = c;
  }

  return {
    conjugationType: type || null,
    conjugationForm: form || null,
    connection: connection || null,
  };
}
