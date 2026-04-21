/**
 * kobun-grammar.json を読み込み、接続規則をインデックス化
 */
import grammarData from '../assets/kobun-grammar.json';

export interface AuxiliaryRule {
  語: string;
  意味: string[];
  接続: string;
  訳例: string[];
}

export interface ParticleRule {
  種類: string;
  語: string;
  意味?: string[];
  訳?: string[];
  呼応?: "連体形" | "已然形";
}

export interface DisambPattern {
  品詞: string;
  接続?: string;
  右?: string;
  意味?: string;
}

export interface DisambFlow {
  condition: string;
  result: string;
  note?: string;
}

export interface VerbExample {
  分類: string;
  品詞: string;
  活用形: string[];
  例: Array<{
    基本形: string;
    語幹: string;
    活用語尾: Record<string, string>;
  }>;
}

export interface AdjectiveExample {
  分類: string;
  品詞: string;
  活用形: string[];
  例: Array<{
    基本形: string;
    語幹: string;
    語尾変化: Record<string, string>;
  }>;
}

/** 文法規則インデックス */
export interface GrammarIndex {
  /** 助動詞→左接続 (例: "けり" → "連用形") */
  auxConn: Map<string, string>;
  /** 係助詞→結びの形 */
  kakari: Map<string, "連体形" | "已然形">;
  /** 曖昧形の識別パターン */
  disamb: Map<string, DisambPattern[]>;
  /** 曖昧形の識別フロー */
  flows: Map<string, DisambFlow[]>;
  /** 動詞活用例 */
  verbs: VerbExample[];
  /** 形容詞活用例 */
  adjectives: AdjectiveExample[];
  /** 助動詞全リスト */
  auxiliaries: AuxiliaryRule[];
  /** 助詞全リスト */
  particles: ParticleRule[];
}

let cachedGrammar: GrammarIndex | null = null;

/**
 * 文法データをロードし、高速検索用のMapに変換
 */
export function loadGrammar(): GrammarIndex {
  if (cachedGrammar) return cachedGrammar;

  try {
    const auxConn = new Map<string, string>();
    const kakari = new Map<string, "連体形" | "已然形">();
    const disamb = new Map<string, DisambPattern[]>();
    const flows = new Map<string, DisambFlow[]>();

    // 助動詞→左接続のマッピング
    if (grammarData.auxiliaries && Array.isArray(grammarData.auxiliaries)) {
      for (const aux of grammarData.auxiliaries) {
        // 括弧付き部分を除去（例: "む（ん）" → "む"、"たり（完了・存続）" → "たり"）
        const cleanWord = aux.語.replace(/[（）\(\)][^（）\(\)]*$/g, "").trim();
        auxConn.set(cleanWord, aux.接続);
        // 「ん」などの別表記も登録
        if (aux.語.includes("（")) {
          const alt = aux.語.match(/[（\(]([^）\)]+)[）\)]/)?.[1];
          if (alt) auxConn.set(alt, aux.接続);
        }
      }
    }

    // 係助詞→呼応の形
    if (grammarData.particles && Array.isArray(grammarData.particles)) {
      for (const prt of grammarData.particles) {
        if (prt.呼応) {
          kakari.set(prt.語, prt.呼応);
        }
      }
    }

    // 識別ルール（パターンリスト形式）
    if (grammarData.identification_rules && Array.isArray(grammarData.identification_rules)) {
      for (const rule of grammarData.identification_rules) {
        disamb.set(rule.語, rule.パターン);
      }
    }

    // 識別ルール（フロー形式）
    if (grammarData.identification_rules_flow && Array.isArray(grammarData.identification_rules_flow)) {
      for (const rule of grammarData.identification_rules_flow) {
        flows.set(rule.語, rule.flow);
      }
    }

    cachedGrammar = {
      auxConn,
      kakari,
      disamb,
      flows,
      verbs: grammarData.verbs || [],
      adjectives: grammarData.adjectives || [],
      auxiliaries: grammarData.auxiliaries || [],
      particles: grammarData.particles || [],
    };

    return cachedGrammar;
  } catch (e) {
    console.warn("Failed to load grammar data:", e);
    // Fallback to empty grammar
    cachedGrammar = {
      auxConn: new Map(),
      kakari: new Map(),
      disamb: new Map(),
      flows: new Map(),
      verbs: [],
      adjectives: [],
      auxiliaries: [],
      particles: [],
    };
    return cachedGrammar;
  }
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearGrammarCache() {
  cachedGrammar = null;
}
