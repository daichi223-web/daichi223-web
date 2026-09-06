// 型定義を持たない依存（moji）と、パッケージ側が名前空間を公開していない
// kuromoji.js のために、実際に使っている範囲だけを宣言する。
// 実行時の挙動は変えない（tsc を通すためだけの宣言）。

declare module 'moji' {
  interface MojiChain {
    /** 全角英数→半角（ZE→HE）、全角スペース→半角（ZS→HS）など */
    convert(from: string, to: string): MojiChain;
    toString(): string;
  }
  const moji: (s: string) => MojiChain;
  export default moji;
}

/**
 * kuromoji.js の解析結果。旧 kuromoji パッケージの @types と同じ名前で参照している
 * 箇所があるため、使っているフィールドだけを名前空間として補う。
 */
declare namespace kuromoji {
  interface IpadicFeatures {
    surface_form: string;
    basic_form: string;
    pos: string;
    pos_detail_1?: string;
    pos_detail_2?: string;
    pos_detail_3?: string;
    conjugated_type?: string;
    conjugated_form?: string;
    reading?: string;
    pronunciation?: string;
    word_id?: number;
    word_type?: string;
    word_position?: number;
  }

  interface Tokenizer<T> {
    tokenize(text: string): T[];
  }
}
