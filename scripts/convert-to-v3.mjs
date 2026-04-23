#!/usr/bin/env node
/**
 * kobun-tan 教材 → kobun-v3 形式 一括変換スクリプト
 *
 * 入力: public/texts/*.json              (kobun-tan 旧形式、106件)
 * 出力:
 *   - public/texts-v3/{id}.json          (KobunText: sentences→tokens)
 *   - public/texts-v3/index.json         (一覧)
 *   - public/guides/{id}.json            (ReadingGuide: introduction/significance/background/author/reading + 拡張)
 *   - public/questions/{id}.json         (設問。kobun-v3 に無いので拡張)
 *
 * 使い方:
 *   cd F:/A2A/apps-released/kobun-tan
 *   node scripts/convert-to-v3.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(process.cwd());
const IN_DIR = join(ROOT, "public", "texts");
const OUT_TEXTS = join(ROOT, "public", "texts-v3");
const OUT_GUIDES = join(ROOT, "public", "guides");
const OUT_QUESTIONS = join(ROOT, "public", "questions");

for (const d of [OUT_TEXTS, OUT_GUIDES, OUT_QUESTIONS]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ------------------------- 設定テーブル -------------------------

/** Obsidian 文法リンクの末尾セグメント → kobun-v3 grammar ID / category / layer */
const GRAMMAR_LINK_MAP = {
  "動詞の活用": { id: "doushi-katsuyo", category: "用言", layer: 1 },
  "形容詞・形容動詞の活用": { id: "keiyoshi-katsuyo", category: "用言", layer: 1 },
  "助動詞-時制系": { id: "jodoshi-jisei", category: "助動詞", layer: 2 },
  "助動詞-推量系": { id: "jodoshi-suiryo", category: "助動詞", layer: 2 },
  "助動詞-否定系": { id: "jodoshi-hitei", category: "助動詞", layer: 2 },
  "助動詞-受身使役尊敬系": { id: "jodoshi-ukemi-shieki-sonkei", category: "助動詞", layer: 2 },
  "助動詞-願望仮想系": { id: "jodoshi-ganbou", category: "助動詞", layer: 2 },
  "助動詞-断定系": { id: "jodoshi-dantei", category: "助動詞", layer: 2 },
  "助詞-格助詞": { id: "joshi-kaku", category: "助詞", layer: 3 },
  "助詞-接続助詞": { id: "joshi-setsuzoku", category: "助詞", layer: 3 },
  "助詞-副助詞・係助詞": { id: "joshi-fuku-kakari", category: "助詞", layer: 3 },
  "助詞-終助詞・準体助詞": { id: "joshi-shujoshi", category: "助詞", layer: 3 },
};

/** kobun-tan の genre → kobun-v3 の genre */
function mapGenre(src) {
  if (!src) return "物語";
  if (src.includes("日記")) return "日記";
  if (src.includes("説話")) return "説話";
  if (src.includes("随筆")) return "随筆";
  if (src.includes("和歌")) return "和歌";
  if (src.includes("物語")) return "物語";
  return "物語";
}

/** 章番号 → difficulty の粗い推定 */
function inferDifficulty(meta) {
  const ch = meta?.chapter ?? 0;
  if (ch <= 2) return 1;
  if (ch <= 5) return 2;
  return 3;
}

const LAYER_DEFS = [
  { id: 1, label: "用言の活用", description: "動詞・形容詞・形容動詞の活用を分析する" },
  { id: 2, label: "助動詞", description: "助動詞の意味・接続・活用を分析する", prerequisite: 1 },
  { id: 3, label: "助詞", description: "助詞の種類と機能を分析する", prerequisite: 2 },
  { id: 4, label: "敬語", description: "敬語の種類と対象を分析する", prerequisite: 3 },
  { id: 5, label: "読解", description: "文法知識を総動員して読み方の手がかりを掴む", prerequisite: 4 },
];

// ------------------------- パース ユーティリティ -------------------------

/**
 * Obsidian 風リンク [[path|display]] をパース。
 * 呼び出し時点でエスケープ `\|` は既に `|` に復元済みであることを前提とする。
 */
function parseObsidianLink(cell) {
  const s = cell.trim();
  const m = s.match(/^\[\[([^\]|]+)\|([^\]]+)\]\]$/);
  if (m) return { linked: true, target: m[1], display: m[2] };
  // リンクなし
  return { linked: false, text: s };
}

/**
 * 文法タグセルから grammarRefId / layer を取得。
 * セルは素のテキスト or [[link|tag]]。
 */
function parseGrammarTagCell(cell) {
  const parsed = parseObsidianLink(cell);
  if (parsed.linked) {
    // target: "20-文法/古文文法/助動詞-時制系" の末尾セグメントでマッチ
    const lastSeg = parsed.target.split("/").pop();
    const mapping = GRAMMAR_LINK_MAP[lastSeg];
    const display = parsed.display;
    return {
      tagText: display,
      grammarRefId: mapping?.id,
      linkCategory: mapping?.category,
      linkLayer: mapping?.layer,
    };
  }
  return { tagText: parsed.text };
}

/** 品詞・活用テキストから pos / conjugationType / conjugationForm / meaning を抽出 */
function parsePosAndConjugation(tagText, linkCategory) {
  if (!tagText) return { pos: "" };
  const t = tagText.trim();
  // 尊敬・謙譲マーカー
  const honorific = /[（(]尊[）)]/.test(t) ? "尊敬" : /[（(]謙[）)]/.test(t) ? "謙譲" : undefined;
  const parts = t.split("・");
  // 動詞・形容詞・助動詞・助詞の分類
  if (linkCategory === "用言") {
    // 例: "ラ四・用", "ハ下二・命（尊）", "補動・ハ四・体（尊）"
    const hasAux = parts[0] === "補動";
    const start = hasAux ? 1 : 0;
    return {
      pos: hasAux ? "補助動詞" : inferPosFromConjType(parts[start] ?? ""),
      conjugationType: (parts[start] ?? "").replace(/[（(].*$/, ""),
      conjugationForm: (parts[start + 1] ?? "").replace(/[（(].*$/, ""),
      honorific,
    };
  }
  if (linkCategory === "助動詞") {
    // 例: "完了・用", "過去・体（結）", "不可能・用"
    return {
      pos: "助動詞",
      meaning: parts[0] ?? "",
      conjugationForm: (parts[1] ?? "").replace(/[（(].*$/, ""),
    };
  }
  if (linkCategory === "助詞") {
    // 例: "格助・引用", "係助・強意（係）", "終助・詠嘆"
    const subtype = (parts[0] ?? "").replace(/^格助$/, "格助詞").replace(/^接助$/, "接続助詞")
      .replace(/^係助$/, "係助詞").replace(/^副助$/, "副助詞").replace(/^終助$/, "終助詞")
      .replace(/^間助$/, "間投助詞");
    return {
      pos: subtype || "助詞",
      meaning: parts.slice(1).join("・").replace(/[（(].*$/, ""),
    };
  }
  // リンクなしのプレーンテキスト（副・代・接助・副助 などが多い）
  const plainPos = t.replace(/[（(].*$/, "").split("・")[0];
  const posMap = {
    "副": "副詞", "代": "代名詞", "感": "感動詞", "接": "接続詞",
    "接助": "接続助詞", "副助": "副助詞", "係助": "係助詞", "終助": "終助詞",
    "間助": "間投助詞", "格助": "格助詞",
  };
  return { pos: posMap[plainPos] || plainPos || "" };
}

function inferPosFromConjType(ct) {
  if (!ct) return "";
  if (/^(ラ|カ|サ|タ|ナ|ハ|バ|マ|ヤ|ワ|ア|ガ|ダ)/.test(ct)) return "動詞";
  if (/^(ク|シク)/.test(ct)) return "形容詞";
  if (/^(ナリ|タリ)/.test(ct)) return "形容動詞";
  if (/^(カ変|サ変|ナ変|ラ変)/.test(ct)) return "動詞";
  return "動詞";
}

/** プレーンテキストの品詞タグから推定レイヤーを返す。0=判定不能 */
function inferLayerFromPlainTag(tagText) {
  if (!tagText) return 0;
  const t = tagText.trim();
  // 助詞（接助・副助・係助・終助・間助・格助）
  if (/^(接助|副助|係助|終助|間助|格助)/.test(t)) return 3;
  // 助動詞（プレーン記述、rare）
  if (/^(現在推量|過去|完了|打消|意志|意思|推量|断定|存続|詠嘆|使役|受身|尊敬|可能|自発|当然|不可能|婉曲|伝聞|比況|願望|仮定|打消意志|打消推量)[・].*?[未用終体已命]/.test(t)) return 2;
  // 用言（動詞・形容詞・形容動詞の活用）
  if (/^(補動・)?[ラカサタナハバマヤワアガダ](上一|上二|下一|下二|四)[・・].*?[未用終体已命]/.test(t)) return 1;
  if (/^(補動・)?(カ変|サ変|ナ変|ラ変)[・・].*?[未用終体已命]/.test(t)) return 1;
  if (/^(ク|シク|ナリ|タリ)[・・].*?[未用終体已命幹]/.test(t)) return 1;
  // 複合動詞
  if (/^[（(]複[）)].*?[未用終体已命]/.test(t)) return 1;
  // 接頭・接尾・連語・感動詞・副詞・代名詞・接続詞は学習対象外
  return 0;
}

/** レイヤーID 推定 */
function determineLayer(linkCategory, posConj, tagText) {
  // 敬語マーカー優先
  if (posConj.honorific) return 4;
  if (tagText && /[（(](尊|謙)[）)]/.test(tagText)) return 4;
  if (linkCategory === "用言") return 1;
  if (linkCategory === "助動詞") return 2;
  if (linkCategory === "助詞") return 3;
  // リンクなし → プレーンテキストから推定
  return inferLayerFromPlainTag(tagText);
}

// ------------------------- 品詞分解表のパース -------------------------

/**
 * 品詞分解の Markdown 表から Token[] 配列を生成。
 * 表形式: | 語 | 品詞・活用 |
 * 先頭の2行（ヘッダ + セパレータ）はスキップ。
 */
function parseBunkai(md) {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const tokens = [];
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    // ヘッダ行 "| 語 | 品詞・活用 |" とセパレータ "|:--|:--|" をスキップ
    if (line.includes("品詞") && line.includes("活用")) continue;
    if (/^\|\s*:?-+:?\s*\|/.test(line)) continue;
    // wikilink 内の `\|` を一時退避 → 列 `|` で分割 → 復元
    const safe = line.replace(/\\\|/g, " ");
    const parts = safe.split("|");
    // 先頭末尾の空セル除去（"| a | b |".split("|") → ["", " a ", " b ", ""]）
    if (parts.length < 4) continue;
    const cells = parts.slice(1, -1).map((c) => c.replace(/ /g, "|").trim());
    if (cells.length < 2) continue;
    const rawText = cells[0];
    const rawTag = cells[1];
    const textParsed = parseObsidianLink(rawText);
    const tokenText = textParsed.linked ? textParsed.display : textParsed.text;
    if (!tokenText) continue;
    const lemma = textParsed.linked ? (textParsed.target.split("/").pop() ?? "") : undefined;
    const tag = parseGrammarTagCell(rawTag);
    const posConj = parsePosAndConjugation(tag.tagText ?? "", tag.linkCategory);
    const layer = determineLayer(tag.linkCategory, posConj, tag.tagText);
    tokens.push({
      _rawText: tokenText,
      start: cursor,
      end: cursor + tokenText.length,
      layer,
      grammarTag: {
        pos: posConj.pos,
        ...(posConj.conjugationType ? { conjugationType: posConj.conjugationType } : {}),
        ...(posConj.conjugationForm ? { conjugationForm: posConj.conjugationForm } : {}),
        ...(posConj.meaning ? { meaning: posConj.meaning } : {}),
        ...(lemma ? { baseForm: lemma } : {}),
        ...(posConj.honorific ? { honorific: posConj.honorific } : {}),
      },
      ...(tag.grammarRefId ? { grammarRefId: tag.grammarRefId } : {}),
    });
    cursor += tokenText.length;
  }
  return tokens;
}

// ------------------------- sentences 分割 -------------------------

/**
 * 本文と全トークンを受け取り、本文を 。 単位で sentences に分割。
 * 各 sentence に対応する tokens を連続切り出しで割り当てる。
 * token の text を順に連結したものが sentence の originalText と一致する前提。
 * ずれたら fallback: 全 token を最後の sentence に押し込む。
 */
function splitSentences(bodyText, allTokens, translation) {
  const body = (bodyText ?? "").replace(/\r\n/g, "\n");
  // 段落 (\n\n) → 文 (。) の2段分割。和歌・引用は 。なしで独立段落。
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const transParas = (translation ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  // 本文冒頭の導入段落（近代日本語）を検出: 古文マーカー（けり/たり/なり/係り結び/ぞ・なむ...）を含まない最初の段落群
  // 乱暴だが、現代語訳の段落数と一致する本文側の末尾 N 段落を本文として使う。
  const transCount = transParas.length;
  let bodyParasForMatch = paragraphs;
  if (transCount > 0 && paragraphs.length > transCount) {
    // 冒頭を落として末尾 transCount 段落だけをマッチ対象に
    bodyParasForMatch = paragraphs.slice(paragraphs.length - transCount);
  }
  const prologue = paragraphs.slice(0, paragraphs.length - bodyParasForMatch.length).join("\n\n");

  // 各段落を 。単位で sentence に分割
  const rawSentences = [];
  bodyParasForMatch.forEach((para, pIdx) => {
    const pieces = splitByPeriod(para);
    pieces.forEach((piece) => {
      rawSentences.push({ paragraphIndex: pIdx, text: piece });
    });
  });

  // 現代語訳も段落×。で分割し、段落インデックスで対応づける
  const transByPara = transParas.map((p) => splitByPeriod(p));

  const sentences = [];
  let tokenCursor = 0;
  const charCursorPerPara = new Map(); // paragraphIndex → char offset within paragraph's flat text
  const paraTokenRanges = []; // tokens の paragraph 内シーケンス

  // flat token 列を sentences に順番に割り当てる
  // 単純に: 各 sentence のテキストを char 数でスライスし、token.end がその範囲内なら割り当て
  const bodyFlat = bodyParasForMatch.join("\n\n");
  // bodyFlat の char offset 基準で rawSentences の範囲を計算
  let offset = 0;
  const sentenceRanges = rawSentences.map((s) => {
    const idx = bodyFlat.indexOf(s.text, offset);
    const from = idx >= 0 ? idx : offset;
    const to = from + s.text.length;
    offset = to;
    return { from, to, text: s.text, paragraphIndex: s.paragraphIndex };
  });

  // tokens の char 座標は bodyFlat と完全には一致しないため、連結長基準で割り当て
  const totalTokenLen = allTokens.reduce((a, t) => a + t._rawText.length, 0);
  const totalBodyLen = sentenceRanges.length ? sentenceRanges[sentenceRanges.length - 1].to : 0;
  const scale = totalBodyLen > 0 ? totalTokenLen / totalBodyLen : 1;

  sentenceRanges.forEach((sr, sIdx) => {
    const targetTokenLen = Math.round(sr.to * scale);
    const sentenceTokens = [];
    let acc = allTokens.slice(0, tokenCursor).reduce((a, t) => a + t._rawText.length, 0);
    while (tokenCursor < allTokens.length) {
      const tk = allTokens[tokenCursor];
      sentenceTokens.push(tk);
      tokenCursor++;
      acc += tk._rawText.length;
      if (acc >= targetTokenLen) break;
    }
    // 最後の sentence に残った token を全部投入
    if (sIdx === sentenceRanges.length - 1) {
      while (tokenCursor < allTokens.length) {
        sentenceTokens.push(allTokens[tokenCursor]);
        tokenCursor++;
      }
    }
    // 翻訳: 同段落の対応 sentence 位置（同段落内のインデックス）から取得
    const paraTrans = transByPara[sr.paragraphIndex] ?? [];
    const inParaIdx = sentenceRanges
      .slice(0, sIdx + 1)
      .filter((x) => x.paragraphIndex === sr.paragraphIndex).length - 1;
    const modernTrans = paraTrans[inParaIdx] ?? paraTrans.join("") ?? "";

    // token id / start / end を sentence 基準で振り直し
    let localCursor = 0;
    const tokens = sentenceTokens.map((tk, i) => {
      const t = {
        id: `s${sIdx + 1}-t${i + 1}`,
        text: tk._rawText,
        start: localCursor,
        end: localCursor + tk._rawText.length,
        layer: tk.layer,
        grammarTag: tk.grammarTag,
        ...(tk.grammarRefId ? { grammarRefId: tk.grammarRefId } : {}),
      };
      localCursor += tk._rawText.length;
      return t;
    });

    sentences.push({
      id: `s${sIdx + 1}`,
      originalText: sr.text,
      modernTranslation: modernTrans,
      tokens,
    });
  });

  return { sentences, prologue };
}

function splitByPeriod(text) {
  // 。 で分割するが、和歌等の句点なし段落は丸ごと返す
  if (!text) return [];
  if (!text.includes("。")) return [text];
  const pieces = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "。") {
      if (buf.trim()) pieces.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) pieces.push(buf.trim());
  return pieces;
}

// ------------------------- 学習ポイント → LearningPoints -------------------------

/**
 * 学習ポイントの Markdown を overview / byLayer 構造にパース。
 * kobun-tan は "### 文学史 / 文法 / 語彙 / 読解" などのカテゴリ見出しで箇条書き。
 * 完全対応は不可能なので best-effort で文学史→overview、文法→layer2、
 * 語彙→layer1、読解→layer5、敬語→layer4、助詞→layer3 にざっくり配分。
 */
function parseLearningPoints(md) {
  if (!md) return undefined;
  const sections = splitByHeadings(md, 3); // ### 見出し
  const byCat = {};
  for (const sec of sections) {
    byCat[sec.heading] = sec.items;
  }
  const overview = [];
  if (byCat["文学史"] || byCat["文学史の要点"]) {
    overview.push(...(byCat["文学史"] || byCat["文学史の要点"]));
  }
  const byLayer = [];
  const catToLayer = [
    { cat: ["用言"], layer: 1, label: "用言の活用" },
    { cat: ["文法", "文法の要点", "助動詞"], layer: 2, label: "助動詞" },
    { cat: ["助詞"], layer: 3, label: "助詞" },
    { cat: ["敬語"], layer: 4, label: "敬語" },
    { cat: ["読解", "読解の要点", "語彙", "語彙の要点"], layer: 5, label: "読解" },
  ];
  for (const mapping of catToLayer) {
    const items = mapping.cat.flatMap((c) => byCat[c] ?? []);
    if (items.length === 0) continue;
    byLayer.push({
      layer: mapping.layer,
      label: mapping.label,
      keyPoint: items[0] ?? "",
      points: items.map((t) => ({ text: t, priority: "important" })),
    });
  }
  return { overview, byLayer };
}

/** ### 見出しで分割し、それぞれの項目（1. / - / 太字番号）を配列化 */
function splitByHeadings(md, level) {
  const lines = md.split(/\r?\n/);
  const prefix = "#".repeat(level) + " ";
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      if (current) sections.push(current);
      current = { heading: line.slice(prefix.length).trim(), items: [] };
      continue;
    }
    if (!current) continue;
    // "1. **xxx**: ..." や "- xxx" を 1 item
    const m = line.match(/^\s*(?:\d+\.|-)\s+(.+)$/);
    if (m) current.items.push(stripMd(m[1]));
  }
  if (current) sections.push(current);
  return sections;
}

function stripMd(s) {
  return s.replace(/\*\*/g, "").replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");
}

// ------------------------- 設問パース -------------------------

function parseQuestions(md) {
  if (!md) return [];
  const blocks = md.split(/(?=^#{3,4}\s)/m);
  const result = [];
  for (const block of blocks) {
    const secMatch = block.match(/^#{3,4}\s+([\d\-.]+\.?\s*[^\n]+)/);
    const section = secMatch ? secMatch[1].trim() : "";
    const qRegex = /\*\*(q\d+)\*\*\s+([\s\S]*?)(?=(?:\n+>\s*\*\*解答\*\*:)|$)/g;
    const aRegex = />\s*\*\*解答\*\*:\s*([\s\S]*?)(?=\n\n|\n\*\*q\d+\*\*|$)/g;
    const questions = [];
    const answers = [];
    let qm;
    while ((qm = qRegex.exec(block)) !== null) questions.push({ id: qm[1], text: qm[2].trim() });
    let am;
    while ((am = aRegex.exec(block)) !== null) answers.push(am[1].trim());
    questions.forEach((q, i) => {
      result.push({
        section,
        id: q.id,
        question: q.text,
        answer: answers[i] ?? "",
      });
    });
  }
  return result;
}

// ------------------------- 背景の glossary 抽出 -------------------------

function parseBackground(md) {
  if (!md) return { content: [], glossary: [] };
  // ### 用語解説 以下の表をパース
  const glossary = [];
  const glossRegex = /###\s*用語解説[\s\S]*?\n\n([\s\S]*?)(?:\n###|\n*$)/;
  const gm = md.match(glossRegex);
  if (gm) {
    const table = gm[1];
    const lines = table.split(/\r?\n/).filter((l) => l.startsWith("|"));
    for (const line of lines.slice(2)) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c !== "");
      if (cells.length >= 3) {
        glossary.push({ term: cells[0], reading: cells[1] === "-" ? "" : cells[1], meaning: cells[2] });
      }
    }
  }
  // glossary 以外の本文
  const mainText = md.replace(/###\s*用語解説[\s\S]*$/, "").trim();
  const content = mainText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean).map(stripMd);
  return { content, glossary };
}

// ------------------------- 変換本体 -------------------------

function convertOne(src) {
  const s = src.sections || {};
  const id = src.id;
  const title = src.title;
  const source = src.source_work ?? "";
  const genre = mapGenre(src.genre);
  const difficulty = inferDifficulty(src.metadata);

  // tokens
  const allTokens = parseBunkai(s["品詞分解"]);
  const { sentences, prologue } = splitSentences(s["本文"], allTokens, s["現代語訳"]);
  const learningPoints = parseLearningPoints(s["学習ポイント"]);

  const kobunText = {
    id,
    title,
    source,
    genre,
    difficulty,
    layers: LAYER_DEFS,
    ...(learningPoints ? { learningPoints } : {}),
    sentences,
    ...(prologue ? { prologue } : {}),
    author: src.author ?? "",
    era: src.era ?? "",
  };

  // guide
  const bg = parseBackground(s["出典_背景"] ?? "");
  const characters = (s["登場人物と敬語分析"] ?? "").trim();
  const learningRaw = (s["学習ポイント"] ?? "").trim();

  const guide = {
    textId: id,
    title,
    source,
    sections: {
      background: {
        heading: "出典・背景",
        content: bg.content,
        glossary: bg.glossary,
      },
      ...(learningRaw ? {
        learningPoints: {
          heading: "学習ポイント",
          content: learningRaw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map(stripMd),
        },
      } : {}),
      ...(characters ? {
        characters: {
          heading: "登場人物と敬語分析",
          content: characters.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map(stripMd),
        },
      } : {}),
    },
  };

  // questions
  const questions = parseQuestions(s["設問"] ?? "");

  // 一覧用サマリ
  const summary = {
    id,
    title,
    source,
    genre,
    difficulty,
    author: src.author ?? "",
    era: src.era ?? "",
    tags: src.tags ?? [],
    metadata: src.metadata ?? {},
    sentenceCount: sentences.length,
    tokenCount: allTokens.length,
    hasGuide: !!(s["出典_背景"] || s["学習ポイント"] || s["登場人物と敬語分析"]),
    hasQuestions: questions.length > 0,
  };

  return { kobunText, guide, questions, summary };
}

// ------------------------- 実行 -------------------------

function main() {
  const files = readdirSync(IN_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
  console.log(`入力 JSON: ${files.length} 件`);

  const index = [];
  const failures = [];

  for (const f of files) {
    const path = join(IN_DIR, f);
    try {
      const src = JSON.parse(readFileSync(path, "utf8"));
      const { kobunText, guide, questions, summary } = convertOne(src);

      writeFileSync(join(OUT_TEXTS, `${src.id}.json`), JSON.stringify(kobunText, null, 2), "utf8");
      writeFileSync(join(OUT_GUIDES, `${src.id}.json`), JSON.stringify(guide, null, 2), "utf8");
      if (questions.length > 0) {
        writeFileSync(join(OUT_QUESTIONS, `${src.id}.json`), JSON.stringify({ textId: src.id, questions }, null, 2), "utf8");
      }

      index.push(summary);
    } catch (err) {
      failures.push({ file: f, error: String(err?.message ?? err) });
    }
  }

  // 一覧
  index.sort((a, b) => (a.metadata?.chapter ?? 0) - (b.metadata?.chapter ?? 0));
  writeFileSync(join(OUT_TEXTS, "index.json"), JSON.stringify(index, null, 2), "utf8");

  console.log(`\n✅ 成功: ${index.length} / ${files.length}`);
  if (failures.length > 0) {
    console.log(`❌ 失敗: ${failures.length}`);
    for (const f of failures) console.log(`  - ${f.file}: ${f.error}`);
  }
  const totalTokens = index.reduce((a, x) => a + (x.tokenCount ?? 0), 0);
  const totalSentences = index.reduce((a, x) => a + (x.sentenceCount ?? 0), 0);
  console.log(`合計 sentences: ${totalSentences}, tokens: ${totalTokens}`);
}

main();
