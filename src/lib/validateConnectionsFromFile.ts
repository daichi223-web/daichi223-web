/**
 * 文法ファイル駆動の接続規則バリデータ
 * 助動詞の左接続、係り結びの呼応、曖昧形の識別を検証
 */
import { loadGrammar } from "./grammarLoader";
import { tokenizeSense, Morpheme } from "../utils/morphTokenizer";
import {
  guessLeftForm,
  guessVerbForm,
  isNounLike,
  guessResultingForm,
  Form,
} from "../utils/formGuesser";

export interface ConnIssue {
  /** 問題のトークン */
  token: string;
  /** 違反した規則 */
  rule: string;
  /** 詳細位置 */
  where: {
    expected?: string;
    found?: string;
    note?: string;
  };
}

/**
 * 接続規則を検証し、違反があればエラーを返す
 */
export function validateConnections(surface: string): ConnIssue[] {
  const grammar = loadGrammar();
  const issues: ConnIssue[] = [];

  // トークン化
  const tokens = tokenizeSense(surface, { ignoreParticles: false });

  // 1. 助動詞の左接続チェック
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.pos !== "aux") continue;

    // 特殊タグはスキップ（「尊敬」など）
    if (token.tag === "尊敬") continue;

    // 左に自立語（内容語）があるか確認
    let leftContentToken = null;
    for (let j = i - 1; j >= 0; j--) {
      if (tokens[j].pos === "content") {
        leftContentToken = tokens[j];
        break;
      }
    }

    // 自立語がない場合、この助動詞は動詞の一部
    if (!leftContentToken) {
      continue; // 「ぼっとする」の「す」など
    }

    // 助動詞の語形を取得（タグから逆引き）
    const auxWord = findAuxWordByTag(token.tag, token.surface, grammar);
    if (!auxWord) continue;

    const expectedConn = grammar.auxConn.get(auxWord);
    if (!expectedConn) continue;

    // 左の語を取得（自立語）
    const leftToken = leftContentToken;
    if (!leftToken) {
      issues.push({
        token: token.surface,
        rule: `助動詞「${auxWord}」は${expectedConn}に接続`,
        where: {
          expected: expectedConn,
          found: "文頭（左語なし）",
          note: "左に接続する語が必要です",
        },
      });
      continue;
    }

    // 左語の形を推定
    const leftForm = guessLeftForm(leftToken.surface);

    // 曖昧形の識別（「き/し」「けれ」など）
    const resolved = resolveAmbiguous(
      leftToken.surface,
      tokens[i + 1]?.surface || "",
      grammar
    );
    const actualForm = resolved?.form || leftForm;

    // 接続チェック
    if (!matchesConnection(actualForm, expectedConn)) {
      issues.push({
        token: token.surface,
        rule: `助動詞「${auxWord}」は${expectedConn}に接続`,
        where: {
          expected: expectedConn,
          found: `${actualForm}（左語: ${leftToken.surface}）`,
          note: resolved?.note || "接続規則違反",
        },
      });
    }
  }

  // 2. 係り結びのチェック
  const kakariTokens = tokens.filter(
    (t) => t.pos === "prt" && grammar.kakari.has(t.surface)
  );
  if (kakariTokens.length > 0) {
    // 最後の係助詞を取得
    const kakari = kakariTokens[kakariTokens.length - 1];
    const expectedResult = grammar.kakari.get(kakari.surface);
    if (expectedResult) {
      // 文末の結びの形を推定
      const lastToken = tokens[tokens.length - 1];
      const resultForm = guessResultingForm(lastToken.surface);

      if (resultForm !== expectedResult) {
        issues.push({
          token: kakari.surface,
          rule: `係助詞「${kakari.surface}」は${expectedResult}で結ぶ`,
          where: {
            expected: expectedResult,
            found: `${resultForm}（文末: ${lastToken.surface}）`,
            note: "係り結びの呼応が合っていません",
          },
        });
      }
    }
  }

  // 3. 曖昧形の右文脈チェック（過去『き』連体形は名詞直前など）
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.pos !== "aux") continue;

    // 過去『き』の連体形（「し」）は右に名詞が必要
    if (token.tag === "過去" && token.surface === "し") {
      const rightToken = tokens[i + 1];
      const rightSurface = rightToken?.surface || "";

      if (!isNounLike(rightSurface)) {
        issues.push({
          token: token.surface,
          rule: "過去『き』連体形は名詞の直前",
          where: {
            expected: "名詞（こと/もの/人など）",
            found: rightSurface || "（文末）",
            note: "形容詞連体形『し』の可能性があります",
          },
        });
      }
    }
  }

  return issues;
}

/**
 * タグと表層から助動詞の語を特定
 */
function findAuxWordByTag(
  tag: string,
  surface: string,
  grammar: ReturnType<typeof loadGrammar>
): string | null {
  // タグから助動詞を逆引き
  for (const aux of grammar.auxiliaries) {
    const cleanWord = aux.語.replace(/[（）\(\)][^（）\(\)]*$/g, "").trim();
    if (aux.意味.includes(tag)) {
      return cleanWord;
    }
  }

  // 表層から直接マッチ
  if (grammar.auxConn.has(surface)) {
    return surface;
  }

  // 一部のケース（「けり」「き」など）
  const directMap: Record<string, string> = {
    けり: "けり",
    き: "き",
    けむ: "けむ",
    べし: "べし",
    まじ: "まじ",
    らむ: "らむ",
    む: "む",
    ず: "ず",
    つ: "つ",
    ぬ: "ぬ",
    たり: "たり",
    り: "り",
  };

  return directMap[surface] || null;
}

/**
 * 活用形が接続要件にマッチするか
 */
function matchesConnection(actualForm: Form, expectedConn: string): boolean {
  if (actualForm === "不明") return true; // 不明は警告しない

  // 接続要件をパース
  if (expectedConn.includes("形")) {
    return actualForm === expectedConn;
  }

  // 複数の接続を許容（例: "未然形／連用形"）
  const allowedForms = expectedConn.split(/[／/・、,]/).map((s) => s.trim());
  return allowedForms.includes(actualForm);
}

/**
 * 曖昧形の識別（「き/し」「けれ」など）
 */
function resolveAmbiguous(
  leftSurface: string,
  rightSurface: string,
  grammar: ReturnType<typeof loadGrammar>
): { form: Form; note: string } | null {
  // 「し」の識別（過去『き』連体 vs 形容詞終止）
  if (leftSurface.endsWith("し")) {
    const patterns = grammar.disamb.get("し");
    if (patterns) {
      // 「行きしこと」の「し」は過去「き」の連体形だが、
      // 助動詞に接続する左語は「行き」（連用形）として判定する。
      if (leftSurface.endsWith("きし")) {
        return {
          form: guessVerbForm(leftSurface.slice(0, -1)),
          note: "過去『き』連体形（左語は連用形）",
        };
      }
      // 右文脈が名詞 → 過去『き』連体形
      if (isNounLike(rightSurface)) {
        return {
          form: "連体形",
          note: "過去『き』連体形（右に名詞）",
        };
      }
      // それ以外 → 形容詞終止形
      return {
        form: "終止形",
        note: "形容詞終止形",
      };
    }
  }

  // 「けれ」の識別（助動詞『けり』已然 vs 形容詞已然）
  if (leftSurface.endsWith("けれ")) {
    // 左に連用形があれば助動詞『けり』
    // ここでは簡易的に形容詞已然と判定
    return {
      form: "已然形",
      note: "形容詞已然形",
    };
  }

  return null;
}

/**
 * 簡易デモ用のヘルパー
 */
export function describeIssues(issues: ConnIssue[]): string {
  if (issues.length === 0) return "接続規則: すべて正常";

  return issues
    .map((issue, i) => {
      return `[${i + 1}] ${issue.token}: ${issue.rule}\n    期待: ${
        issue.where.expected || "—"
      }\n    実際: ${issue.where.found || "—"}\n    備考: ${
        issue.where.note || "—"
      }`;
    })
    .join("\n\n");
}
