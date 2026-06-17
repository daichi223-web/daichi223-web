// build-reibun-seed.mjs
// 助動詞例文集（_all_sets.json）→ grammar_reibun / grammar_jodoshi_meanings の seed SQL を生成。
// 生成エージェント不要・純変換なので 8GB 機でも安全。
//
//   node scripts/build-reibun-seed.mjs  [path/to/_all_sets.json]
// 既定入力: F:/A2A/_all_sets.json
// 出力:     supabase/seeds/grammar-reibun.sql
//
// 行データは buildRows(src) で組み立て、SQL 生成と REST 投入(apply-reibun.mjs)で共用する。
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SRC = "F:/A2A/_all_sets.json";
const OUT = path.join(process.cwd(), "supabase/seeds/grammar-reibun.sql");

const ROMAJI = {
  "けり": "keri", "つ": "tsu", "ぬ": "nu", "たり": "tari", "り": "ri",
  "まじ": "maji", "けむ": "kemu", "らむ": "ramu", "ごとし": "gotoshi",
  // 多義助動詞 第2弾（2026-06-17）
  "む": "mu", "べし": "beshi", "す・さす・しむ": "su", "る・らる": "ru",
  "なり": "nari", "まし": "mashi", "じ": "ji", "めり": "meri",
};

// 初代9助動詞（出力を不変に保つため、新ロジックは新助動詞だけに適用）
const ORIG = new Set(["keri", "tsu", "nu", "tari", "ri", "maji", "kemu", "ramu", "gotoshi"]);

// 決め手の型（後接/呼応/形/主語/文脈）。meaning_key ごとに確定（手作業・捏造なし）
const TYPE_MAP = {
  "keri-1": "文脈", "keri-2": "文脈",
  "tsu-1": "後接", "tsu-2": "後接",
  "nu-1": "後接", "nu-2": "後接",
  "tari-1": "文脈", "tari-2": "文脈",
  "ri-1": "文脈", "ri-2": "文脈",
  "maji-1": "主語", "maji-2": "主語", "maji-3": "主語", "maji-4": "文脈", "maji-5": "呼応",
  "kemu-1": "形", "kemu-2": "呼応", "kemu-3": "形",
  "ramu-1": "文脈", "ramu-2": "呼応", "ramu-3": "形",
  "gotoshi-1": "形", "gotoshi-2": "形",
};

// 新助動詞の決め手型（意味→型）。初代は上の TYPE_MAP を使う。
function inferDeciderType(jodoshi, meaning) {
  const m = meaning;
  // 形・接続・語形で決まる
  if (/婉曲|仮定|比況|例示/.test(m)) return "形";
  if (/断定|存在/.test(m)) return "形"; // 体言・連体形接続で決まる
  if (/伝聞|推定/.test(m)) return jodoshi.includes("めり") ? "文脈" : "形"; // なり=終止接続/めり=視覚文脈
  // 呼応（係助詞・打消・呼応副詞・反実の「ましかば〜まし」）
  if (/反実仮想|ためらい/.test(m)) return "呼応";
  if (/可能/.test(m)) return "呼応"; // 下に打消を伴う
  // 主語の人称で決まる
  if (/意志|勧誘|適当|命令/.test(m)) return "主語";
  if (/打消推量|打消意志|推量/.test(m)) return "主語";
  // 下接語で決まる（尊敬＝給ふ等／使役＝対象）
  // 尊敬: る・らるは主語(貴人)が決め手。す・さす・しむは下接「給ふ」(二重敬語)＝後接。
  if (/尊敬/.test(m)) return jodoshi === "る・らる" ? "主語" : "後接";
  if (/使役/.test(m)) return "文脈";
  return "文脈";
}

// 行データを組み立てる（SQL生成・REST投入で共用）。副作用なし。
export function buildRows(src = DEFAULT_SRC) {
  // 手がかり注釈（任意）: F:/A2A/_cues.json = { "meaning_key#idx": [{text,type,note}] }
  let CUES = {};
  try {
    CUES = JSON.parse(fs.readFileSync("F:/A2A/_cues.json", "utf8"));
  } catch {
    /* 注釈未生成でも seed は作れる */
  }

  const sets = JSON.parse(fs.readFileSync(src, "utf8"));
  const reibun = [];
  const meanings = [];
  const perJodoshi = {};

  for (const s of sets) {
    const romaji = ROMAJI[s.jodoshi];
    if (!romaji) throw new Error(`未知の助動詞: ${s.jodoshi}`);
    perJodoshi[romaji] = (perJodoshi[romaji] || 0) + 1;
    const mIdx = perJodoshi[romaji];
    const meaningKey = `${romaji}-${mIdx}`;

    const isNew = !ORIG.has(romaji);
    const dtype = TYPE_MAP[meaningKey] || (isNew ? inferDeciderType(s.jodoshi, s.meaning) : null);
    meanings.push({
      meaning_key: meaningKey,
      jodoshi: s.jodoshi,
      meaning: s.meaning,
      decider_rule: s.decider_rule,
      decider_type: dtype,
      sort: mIdx,
    });

    s.examples.forEach((e, i) => {
      const id = `reibun-${meaningKey}-${String(i + 1).padStart(2, "0")}`;
      const conf = e.confidence || "medium";
      // 両論ある例(noQuiz)は出題から除外（正解衝突を防ぐ）。事典には残す
      const isQuiz = conf === "high" && e.verified === true && e.noQuiz !== true;
      // 手がかり：注釈があれば取り込み、text は本文の部分文字列のみ採用（幻覚排除）
      const ref = `${meaningKey}#${i + 1}`;
      let rawCues = Array.isArray(CUES[ref]) ? CUES[ref] : [];
      // 新助動詞で注釈未生成なら、本文の《…》から手がかりを自動生成（型は意味から推定）
      if (isNew && rawCues.length === 0) {
        const spans = [...e.sentence.matchAll(/《([^》]*)》/g)].map((m) => m[1]).filter(Boolean);
        rawCues = spans.map((t) => ({ text: t, type: dtype, note: e.decider || "" }));
      }
      const cues = rawCues.filter(
        (c) => c && c.type && (c.text === "" || (c.text && e.sentence.includes(c.text)))
      );
      reibun.push({
        id,
        jodoshi: s.jodoshi,
        meaning_key: meaningKey,
        meaning: s.meaning,
        sentence: e.sentence,
        translation: e.translation,
        source: e.source,
        work_key: null,
        context: e.context,
        decider: e.decider,
        period: e.period,
        confidence: conf,
        verified: e.verified === true,
        is_quiz: isQuiz,
        layer: null,
        decider_type: dtype,
        cues: cues.length ? cues : null,
        sort: i + 1,
      });
    });
  }
  return { meanings, reibun, setCount: sets.length };
}

// ---- SQL シリアライズ（従来出力をバイト単位で維持）----
const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const b = (v) => (v ? "true" : "false");

function toSql({ meanings, reibun, setCount }) {
  const meaningRows = meanings.map(
    (m) => `('${m.meaning_key}', ${q(m.jodoshi)}, ${q(m.meaning)}, ${q(m.decider_rule)}, ${q(m.decider_type)}, ${m.sort})`
  );
  const reibunRows = reibun.map((r) => {
    const cuesJson = r.cues ? `'${JSON.stringify(r.cues).replace(/'/g, "''")}'::jsonb` : "null";
    return (
      `(${q(r.id)}, ${q(r.jodoshi)}, '${r.meaning_key}', ${q(r.meaning)}, ${q(r.sentence)}, ` +
      `${q(r.translation)}, ${q(r.source)}, null, ${q(r.context)}, ${q(r.decider)}, ` +
      `${q(r.period)}, ${q(r.confidence)}, ${b(r.verified)}, ${b(r.is_quiz)}, null, ${q(r.decider_type)}, ${cuesJson}, ${r.sort})`
    );
  });
  return `-- AUTO-GENERATED by scripts/build-reibun-seed.mjs — do not edit by hand.
-- 助動詞例文集（拡充版）seed。${setCount}意味セット / ${reibunRows.length}例。
begin;
delete from grammar_reibun;
delete from grammar_jodoshi_meanings;

insert into grammar_jodoshi_meanings (meaning_key, jodoshi, meaning, decider_rule, decider_type, sort) values
${meaningRows.join(",\n")};

insert into grammar_reibun
  (id, jodoshi, meaning_key, meaning, sentence, translation, source, work_key, context, decider, period, confidence, verified, is_quiz, layer, decider_type, cues, sort) values
${reibunRows.join(",\n")};
commit;
`;
}

// ---- CLI 実行（直接起動時のみ）----
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("build-reibun-seed.mjs");
if (isMain) {
  const src = process.argv[2] || DEFAULT_SRC;
  const data = buildRows(src);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, toSql(data));
  const quizN = data.reibun.filter((r) => r.confidence === "high" && r.verified).length;
  console.log(`✅ ${OUT}`);
  console.log(`   意味セット ${data.meanings.length} / 例文 ${data.reibun.length}（出題対象 is_quiz=${quizN}）`);
}
