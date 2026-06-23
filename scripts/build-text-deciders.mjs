// build-text-deciders.mjs
// 全教材(texts-v3)の助動詞に、意味決定の「決め手」(型+理由+手がかり cues)を付与して
// public/analysis/<id>.json に書き出す。例文集(grammar_reibun)と同じモデル。
//
//   node scripts/build-text-deciders.mjs            … 全教材を生成(既存の手書き決め手は保持)
//   node scripts/build-text-deciders.mjs <id> ...   … 指定教材のみ
//   node scripts/build-text-deciders.mjs --dry <id> … 標準出力に出すだけ(書き込まない)
//
// 重要な前提:
//  - 意味(meaning)は教材が確定済み。ここでは「なぜその意味か」を説明するだけ(捏造しない)。
//  - 既に decider がある token はそのまま残す(東下り等の手書き gold を上書きしない)。
//  - cues.text は本文の部分文字列で、かつ文中に1回しか現れない語のみ採用(誤ハイライト防止)。
import fs from "node:fs";
import path from "node:path";
import { extractJodoshi, loadText, allTextIds, ANALYSIS_DIR } from "./text-deciders.lib.mjs";

const TYPES = new Set(["後接", "呼応", "形", "主語", "文脈"]);
const FORM_JP = { 用: "連用形", 未: "未然形", 終: "終止形", 体: "連体形", 已: "已然形", 命: "命令形" };
const INFLECT = new Set(["動詞", "形容詞", "形容動詞", "助動詞"]);

// 意味 → 決め手の型（例文集の方針に準拠）。lemma で一部上書き。
const TYPE_BY_MEANING = {
  過去: "文脈", 詠嘆: "文脈", 過去伝聞: "文脈", 現在推量: "文脈",
  完了: "形", 完了体: "形", 存続: "文脈", 強意: "後接",
  断定: "形", 存在: "形", 比況: "形", "比況（幹）": "形",
  打消: "形", 打消推量: "主語", 打消意志: "主語", 打消当然: "主語", 不可能: "呼応",
  推量: "主語", 意志: "主語", 婉曲: "形", 仮定: "形", 当然: "文脈", 適当: "文脈",
  可能: "呼応", 過去推量: "形", 原因推量: "呼応", 過去の原因推量: "呼応",
  反実仮想: "呼応", 推定: "形", 伝聞: "形",
  尊敬: "主語", 受身: "文脈", 使役: "文脈", 自発: "文脈", 希望: "形", 願望: "形",
};

// 表層＋refId からおおまかな lemma を推定（説明文・分岐用）
function lemmaOf(j) {
  const s = j.surface;
  const r = j.refId || "";
  if (r === "jodoshi-ukemi-shieki-sonkei") {
    if (/^(せ|さ|し|しめ)/.test(s)) return "す・さす・しむ";
    return "る・らる";
  }
  if (r === "jodoshi-dantei") return /たり|たる|たれ/.test(s) ? "たり(断定)" : "なり(断定)";
  if (r === "jodoshi-ganbou") return /まほ/.test(s) ? "まほし" : "たし";
  if (/^(けり|けら|ける|けれ)$/.test(s)) return "けり";
  if (/^(き|し|しか)$/.test(s)) return "き";
  if (/^(つ|て|つる|つれ|てよ)$/.test(s)) return "つ";
  if (/^(ぬ|に|ぬる|ぬれ|な|ね)$/.test(s) && r === "jodoshi-jisei") return "ぬ";
  if (/^(たり|たら|たる|たれ|と)$/.test(s) && r === "jodoshi-jisei") return "たり";
  if (/^(り|ら|る|れ)$/.test(s) && r === "jodoshi-jisei") return "り";
  if (/^(ず|ざ|ぬ|ね|ざら|ざり|ざる|ざれ)$/.test(s)) return "ず";
  if (/^べ/.test(s)) return "べし";
  if (/^らむ?$/.test(s) || s === "らん") return "らむ";
  if (/^け[むん]$/.test(s)) return "けむ";
  if (/^まし/.test(s)) return "まし";
  if (s === "じ") return "じ";
  if (/^まじ/.test(s)) return "まじ";
  if (/^め/.test(s)) return "めり";
  if (/^(なり|なる|なれ)$/.test(s)) return "なり(伝聞推定)";
  if (/^ごと/.test(s)) return "ごとし";
  if (/^(む|ん|め)$/.test(s)) return "む";
  return s;
}

function typeOf(meaning, lemma) {
  let t = TYPE_BY_MEANING[meaning] || "文脈";
  if (meaning === "尊敬" && lemma === "す・さす・しむ") t = "後接"; // 二重敬語(＋給ふ)
  if ((meaning === "推定" || meaning === "伝聞") && lemma === "めり") t = "文脈"; // めり=視覚
  return t;
}

// 文中で1回だけ出現し、判定対象スパンと重ならない語か（手がかり採用の条件）
function cueUsable(sentence, target, span) {
  if (!target) return false;
  const first = sentence.indexOf(target);
  if (first === -1) return false;
  if (sentence.indexOf(target, first + target.length) !== -1) return false; // 2回以上→不可
  // 判定対象スパン[start,end)と重ならないこと
  if (span && first < span.end && first + target.length > span.start) return false;
  return true;
}

// 決め手の本文(summary)と手がかり(cues)を組み立てる
function deriveDecider(j, span) {
  const m = j.meaning;
  const lemma = lemmaOf(j);
  const type = typeOf(m, lemma);
  const prevOk = j.prev && INFLECT.has(j.prev.pos) && FORM_JP[j.prev.form];
  const prevForm = prevOk ? FORM_JP[j.prev.form] : null;
  const sent = j.sentence;
  const cues = [];

  // 接続を述べる定型部分
  const conn = prevOk ? `直前『${j.prev.text}』は${prevForm}。` : "";

  let summary;
  switch (m) {
    case "過去":
      summary = `地の文の文末などで過去の事実を述べる〈過去〉(『〜た』)。会話・和歌では詠嘆になることもある。`;
      cues.push({ text: "", type: "文脈", note: "地の文＝過去(会話・和歌の文末なら詠嘆もある)。" });
      break;
    case "詠嘆":
      summary = `和歌・会話文に現れ、気づきや感動を表す〈詠嘆〉(『〜なあ・〜だなあ』)。地の文の回想の過去とは区別する。`;
      cues.push({ text: "", type: "文脈", note: "和歌・会話の文末＝詠嘆(地の文なら過去)。" });
      break;
    case "完了": case "完了体":
      summary = `${conn}連用形＋『${j.surface}』＝〈完了〉(『〜た・〜てしまった』)。打消『ず』の連体形『ぬ』や断定『なり』は接続が違う(未然形・体言)ので、直前の活用形で識別する。`;
      if (prevOk) cues.push({ text: j.prev.text, type: "形", note: `連用形＋『${j.surface}』＝完了。` });
      break;
    case "存続":
      summary = `${conn}動作の結果が続く状態を表す〈存続〉(『〜ている・〜てある』)。連用形(つ・ぬ・たり)・四段已然形やサ変未然形(り)に接続する。`;
      if (prevOk) cues.push({ text: j.prev.text, type: "形", note: `${prevForm}＋『${j.surface}』＝完了・存続。状態の継続で存続。` });
      else cues.push({ text: "", type: "文脈", note: "状態が続く文脈＝存続。" });
      break;
    case "強意":
      summary = `『${j.surface}』の下に推量の語(べし・む・らむ等)を伴い〈強意(確述)〉(『きっと〜・必ず〜』)。確かさを強める。`;
      cues.push({ text: "", type: "後接", note: "下に推量の語を伴う＝強意(確述)。" });
      break;
    case "断定":
      summary = `体言・連体形に接続する断定『${lemma.startsWith("たり") ? "たり" : "なり"}』＝〈断定〉(『〜である・〜だ』)。伝聞推定『なり』は終止形接続なので、接続で識別する。`;
      cues.push({ text: "", type: "形", note: "体言・連体形に接続＝断定(伝聞推定なりは終止形接続)。" });
      break;
    case "存在":
      summary = `体言＋『${j.surface}』＋体言の形で〈存在〉(『〜にある・〜にいる』)。同形の断定『なり』とは文脈で識別する。`;
      cues.push({ text: "", type: "形", note: "体言を挟む『〜なる〜』＝存在『〜にある』。" });
      break;
    case "打消":
      summary = `${conn}未然形＋『${j.surface}』＝〈打消〉(『〜ない』)。完了『ぬ』は連用形接続なので、直前の活用形で識別する。`;
      if (prevOk) cues.push({ text: j.prev.text, type: "形", note: `未然形＋『${j.surface}』＝打消(完了は連用形接続)。` });
      break;
    case "打消推量":
      summary = `未然形接続の『${j.surface}』。主語が一・三人称で〈打消推量〉(『〜ないだろう』)。`;
      cues.push({ text: "", type: "主語", note: "主語の人称で打消推量(〜ないだろう)。" });
      break;
    case "打消意志":
      summary = `主語が一人称で〈打消意志〉(『〜まい・〜ないつもりだ』)。三人称なら打消推量になる。`;
      cues.push({ text: "", type: "主語", note: "主語は一人称＝打消意志。" });
      break;
    case "打消当然":
      summary = `『まじ』で〈打消当然〉(『〜はずがない・〜べきでない』)。文脈と主語で当然系の意味を選ぶ。`;
      cues.push({ text: "", type: "主語", note: "打消当然(〜はずがない)。" });
      break;
    case "推量":
      summary = `終止形(ラ変は連体形)に接続。主語が三人称で〈推量〉(『〜だろう』)。一人称なら意志になる。`;
      cues.push({ text: "", type: "主語", note: "主語が三人称＝推量(〜だろう)。" });
      break;
    case "意志":
      summary = `主語が一人称で〈意志〉(『〜しよう』)。『〜むとす』『いざ〜む』も意志の目印。二人称なら勧誘になる。`;
      cues.push({ text: "", type: "主語", note: "主語は一人称＝意志(〜しよう)。" });
      break;
    case "婉曲":
      summary = `連体形『${j.surface}』＋体言の形で〈婉曲〉(『〜ような』)・仮定。文末の意志・推量と違い、体言を修飾するのが目印。`;
      cues.push({ text: "", type: "形", note: "連体形＋体言＝婉曲『〜ような』。" });
      break;
    case "仮定":
      summary = `連体形『${j.surface}』で〈仮定〉(『もし〜なら、その〜』)。多く下に体言を伴う。`;
      cues.push({ text: "", type: "形", note: "連体形＋体言＝仮定・婉曲。" });
      break;
    case "当然":
      summary = `『${j.surface}』を〈当然〉(『〜はずだ・〜べきだ・〜なければならない』)と読む。べしの六義は文脈で選ぶ。`;
      cues.push({ text: "", type: "文脈", note: "文脈から当然(〜はずだ)を選ぶ。" });
      break;
    case "適当":
      summary = `『${j.surface}』を〈適当〉(『〜のがよい・ふさわしい』)と読む。べしの六義は文脈で選ぶ。`;
      cues.push({ text: "", type: "文脈", note: "文脈から適当(〜のがよい)を選ぶ。" });
      break;
    case "可能":
      summary = `下に打消を伴って〈可能〉(『〜できる／(打消で)〜できない』)。呼応で判断する。`;
      cues.push({ text: "", type: "呼応", note: "下の打消と呼応して可能(〜できない)。" });
      break;
    case "過去推量":
      summary = `${conn}連用形接続の『${j.surface}』(けむ)。過去の事柄を推量〈過去推量〉(『〜ただろう』)。`;
      if (prevOk) cues.push({ text: j.prev.text, type: "形", note: `連用形＋『${j.surface}』＝過去推量(けむ)。` });
      else cues.push({ text: "", type: "形", note: "連用形接続のけむ＝過去推量。" });
      break;
    case "原因推量": case "過去の原因推量":
      summary = `疑問語・係助詞と呼応し、眼前(または過去)の事柄の理由を推量する〈原因推量〉(『どうして〜のだろう』)。`;
      if (j.kakari[0] && cueUsable(sent, j.kakari[0], span)) cues.push({ text: j.kakari[0], type: "呼応", note: "疑問の係助詞と呼応＝原因推量。" });
      else cues.push({ text: "", type: "呼応", note: "疑問語・係助詞と呼応して原因推量。" });
      break;
    case "現在推量":
      summary = `終止形接続の『${j.surface}』(らむ)。今ごろ〜しているだろうと、目に見えない現在を推量〈現在推量〉。`;
      cues.push({ text: "", type: "文脈", note: "今ごろ〜だろう＝現在推量(らむ)。" });
      break;
    case "反実仮想":
      summary = `『〜ましかば(ませば)…まし』の呼応で〈反実仮想〉(『もし〜だったら…だろうに』)。事実に反する仮定。`;
      cues.push({ text: "", type: "呼応", note: "『ましかば…まし』の呼応＝反実仮想。" });
      break;
    case "推定":
      summary = lemma === "めり"
        ? `『めり』で、目に見える様子から〈推定〉(『〜ように見える・〜ようだ』)。`
        : `終止形接続の『なり』。音や伝え聞きを根拠に〈推定〉(『〜らしい・〜ようだ』)。断定は体言・連体形接続なので識別する。`;
      cues.push({ text: "", type: lemma === "めり" ? "文脈" : "形", note: lemma === "めり" ? "視覚にもとづく推定(めり)。" : "終止形接続＝伝聞推定のなり。" });
      break;
    case "伝聞":
      summary = `終止形接続の『なり』。人づての情報を表す〈伝聞〉(『〜という・〜そうだ』)。断定『なり』は体言・連体形接続なので識別する。`;
      cues.push({ text: "", type: "形", note: "終止形接続＝伝聞推定のなり。" });
      break;
    case "過去伝聞":
      summary = `『けり』で、直接見ていない過去を人づてに語る〈過去(伝聞)〉(『〜たそうだ・〜たという』)。`;
      cues.push({ text: "", type: "文脈", note: "伝え聞いた過去＝過去(伝聞)。" });
      break;
    case "尊敬":
      if (lemma === "す・さす・しむ") {
        summary = `使役の『${j.surface}』だが、下に尊敬語『給ふ』等を伴う二重敬語で〈尊敬〉(『お〜になる』)。`;
        if (j.next && cueUsable(sent, j.next.text, span)) cues.push({ text: j.next.text, type: "後接", note: "下の尊敬語と合わさり二重敬語＝尊敬。" });
        else cues.push({ text: "", type: "後接", note: "下の尊敬語(給ふ等)と二重敬語＝尊敬。" });
      } else {
        summary = `動作主が貴人で〈尊敬〉(『〜なさる・お〜になる』)。受身・自発・可能と文脈・主語で識別する。`;
        cues.push({ text: "", type: "主語", note: "動作主が貴人＝尊敬。" });
      }
      break;
    case "受身":
      summary = `『〜に』などの動作主を伴い〈受身〉(『〜れる・〜られる』)。尊敬・自発・可能とは文脈で識別する。`;
      cues.push({ text: "", type: "文脈", note: "動作主『〜に』を伴う＝受身。" });
      break;
    case "使役":
      summary = `使役の対象を伴い〈使役〉(『〜させる』)。下に尊敬語が付けば尊敬になる。`;
      cues.push({ text: "", type: "文脈", note: "使役の対象を伴う＝使役。" });
      break;
    case "自発":
      summary = `心情・知覚の動詞に付き、自然とそうなる〈自発〉(『自然に〜される・つい〜してしまう』)。`;
      cues.push({ text: "", type: "文脈", note: "心情・知覚の語に付く＝自発。" });
      break;
    case "比況": case "比況（幹）":
      summary = `『${j.surface}』で〈比況〉(『〜のようだ・〜と同じだ』)。連体形・体言＋『が』に接続する。`;
      cues.push({ text: "", type: "形", note: "比況(〜のようだ)。" });
      break;
    case "希望": case "願望":
      summary = `『${j.surface}』で〈希望〉(『〜たい』)。まほし(未然形接続)・たし(連用形接続)。`;
      if (prevOk) cues.push({ text: j.prev.text, type: "形", note: `${prevForm}＋『${j.surface}』＝希望(〜たい)。` });
      else cues.push({ text: "", type: "形", note: "希望(〜たい)。" });
      break;
    default:
      summary = `${conn}文脈から〈${m}〉と判断する。`;
      cues.push({ text: "", type: type, note: `文脈から${m}。` });
  }

  // 接続が確かなら、形系でない型でも prev を形の手がかりとして1つ添える(誤りない範囲で)
  if (prevOk && !cues.some((c) => c.text === j.prev.text) && cueUsable(sent, j.prev.text, span) &&
      ["主語", "文脈", "呼応", "後接"].includes(type) &&
      ["意志", "推量", "打消推量", "打消意志"].includes(m)) {
    cues.push({ text: j.prev.text, type: "形", note: `${prevForm}＋『${j.surface}』(接続)。` });
  }

  // 本文に1回しか出ない語の手がかりだけ残す(空文字=語なしは常に可)
  const safeCues = cues.filter((c) => c.text === "" || cueUsable(sent, c.text, span));
  // 手がかりが全て曖昧で消えた場合も、型の手がかり(語なし)を必ず1つ残す
  if (!safeCues.length) {
    const fb = {
      形: "活用形・接続で意味が決まる。",
      後接: "下に来る語で意味が決まる。",
      呼応: "係助詞・疑問語・呼応副詞・打消などとの呼応で決まる。",
      主語: "主語の人称で意味が決まる。",
      文脈: "地の文／会話／和歌など文脈で意味が決まる。",
    };
    safeCues.push({ text: "", type, note: `${fb[type] || ""}〈${m}〉。` });
  }
  return { meaning: m, type, summary, cues: safeCues };
}

// token の本文内スパン[start,end)を取得（【】ハイライトと手がかりの衝突回避用）
function spanOf(text, tokenId) {
  for (const s of text.sentences) for (const t of s.tokens) if (t.id === tokenId) return { start: t.start, end: t.end };
  return null;
}

// 手書き gold（東下り3本）。--force でも決して再生成しない。
const GOLD = new Set(["e245dd3617", "bfa5b23cf2", "1af601c3ea", "3d0d7bf6ee", "31d11bf2f8", "chigo-no-sorane", "e9d989b44a", "567eed13fe", "515679c1ce", "b621d6ca53", "6f8c66024b", "84bdc39850", "d1e41d3f09", "f9c215dd74", "f84b5ac5c5", "18019954e6", "03a2e8e8af", "76758ae087", "5ce9ba8c46", "b0c46b4d93", "3cd78122cb", "f1c4b82dd3", "9662ce1347", "622041c1e6", "dd1c1e0d14", "0213bea23e", "b6f9644033", "1811f6888e", "1689245ecd", "7b959c5be1", "ab2e5ff73a", "815a43f9e7", "068cd465f4", "08ac4e0173", "a2bfd6cb02", "524e7d139e", "f7aee682ff", "4c8f90856b", "cbf3db0edb", "58646d5f6d", "44bbd6ede4", "1e0f1afaa5", "cd99eca887", "a2a8093ed5", "0f5e09d145", "cec7f3b46f", "61ad02e1df", "bb32c7b026", "8e08e3212f", "b34f00e739", "956e5deab8", "30e5ed715f", "3fd486fdb0", "da80b8aade", "3b84921e74", "83e7b6a341", "0a93657296", "467249bc39", "364673ceb1", "f78ab86be9", "0fa06efdfe", "4a48018f8b"]);

function buildForText(id, root = ".", force = false) {
  const text = loadText(id, root);
  const jodoshi = extractJodoshi(text);
  const outPath = path.join(root, ANALYSIS_DIR, `${id}.json`);
  let existing = { textId: id, tokenAnalyses: [] };
  try { existing = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { /* 新規 */ }
  const byId = new Map((existing.tokenAnalyses || []).map((a) => [a.tokenId, a]));
  const regen = force && !GOLD.has(id); // gold 以外は --force で上書き再生成

  let added = 0, kept = 0;
  for (const j of jodoshi) {
    const cur = byId.get(j.tokenId);
    if (cur && cur.decider && !regen) { kept++; continue; } // 既存 decider は保持（forceかつ非goldなら再生成）
    const span = spanOf(text, j.tokenId);
    const decider = deriveDecider(j, span);
    if (cur) cur.decider = decider;
    else byId.set(j.tokenId, { tokenId: j.tokenId, decider });
    added++;
  }
  const merged = { textId: id, tokenAnalyses: [...byId.values()] };
  return { merged, outPath, added, kept, total: jodoshi.length };
}

// ---- CLI ----
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const force = args.includes("--force");
const ids = args.filter((a) => a !== "--dry" && a !== "--force");
const targets = ids.length ? ids : allTextIds(".");

let totAdded = 0, totKept = 0, files = 0, badCues = 0;
for (const id of targets) {
  const { merged, outPath, added, kept } = buildForText(id, ".", force);
  // 検証: 型・部分文字列・一意性
  for (const a of merged.tokenAnalyses) {
    if (!a.decider) continue;
    if (!TYPES.has(a.decider.type)) { console.error(`✗ ${id} ${a.tokenId} bad type`); badCues++; }
  }
  if (dry) {
    console.log(`\n===== ${id}  (+${added} 生成 / ${kept} 保持) =====`);
    for (const a of merged.tokenAnalyses) {
      if (!a.decider) continue;
      console.log(`  ${a.tokenId} 〔${a.decider.type}〕${a.decider.meaning}: ${a.decider.summary}`);
      for (const c of a.decider.cues) console.log(`      手がかり[${c.type}] ${c.text ? "「" + c.text + "」" : "(語なし)"} ${c.note}`);
    }
  } else if (added > 0) {
    // 何も生成しない教材(東下り等の完成済み gold)はファイルを触らない
    fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  }
  totAdded += added; totKept += kept; files++;
}
console.log(`\n${dry ? "[dry] " : ""}files=${files} generated=${totAdded} kept(gold)=${totKept} badType=${badCues}`);
