// api/getChoices.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import fs from "fs";
import path from "path";
import {
  canUseAsDistractor,
  indexByLemma,
  trapOverlapsSense,
  type ChoiceMode,
  type SenseLike,
} from "../src/lib/senseEquivalence.js";
// 同義判定に使う senseNorm・pos は data/kobun_q.jsonl.txt に無いので slim から補う
// （約700KB。関数に同梱され、読み込みはコールドスタート時の1回）
import slimJson from "../src/data/kobunQ.v2.slim.json" with { type: "json" };

/** kobun_q の1行（同義判定に要る senseNorm・pos を slim から足したもの） */
export type QRow = SenseLike & Record<string, unknown>;

let QMAP: Map<string, QRow> | null = null;

function loadQuestionsOnce() {
  if (QMAP) return QMAP;
  const p = path.join(process.cwd(), "data", "kobun_q.jsonl.txt");
  if (!fs.existsSync(p)) throw new Error("Data file not found");

  const slim = new Map<string, { senseNorm?: string; pos?: string }>();
  for (const s of slimJson as Array<{ qid: string; senseNorm?: string; pos?: string }>) {
    slim.set(String(s.qid), { senseNorm: s.senseNorm, pos: s.pos });
  }

  const lines = fs.readFileSync(p, "utf-8").split(/\r?\n/).filter(Boolean);
  QMAP = new Map();
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.qid) QMAP.set(String(obj.qid), { ...obj, ...(slim.get(String(obj.qid)) ?? {}) });
    } catch {}
  }
  return QMAP!;
}

// 現代語の罠（古今異義語）。lemma → 罠の意味文字列[]
let TRAPS: Record<string, string[]> | null = null;

function loadTrapsOnce(): Record<string, string[]> {
  if (TRAPS) return TRAPS;
  try {
    const p = path.join(process.cwd(), "data", "modern_traps.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    delete raw._comment;
    TRAPS = raw;
  } catch {
    TRAPS = {};
  }
  return TRAPS!;
}

type Choice = {
  qid: string;
  lemma: string;
  sense: string;
  freq?: number;
  isFromCandidates?: boolean;
};

export type BuildChoicesInput = {
  correct: QRow;
  qmap: Map<string, QRow>;
  /** candidates 表の行（accept を先、negative を後に並べたもの） */
  candidateRows: Array<{ qid: string; freq?: number | null }>;
  /** 正解の見出し語の現代語の罠 */
  traps: string[];
  excludeQids: string[];
  mode: string;
  /** 乱数（検証スクリプトが固定種を渡す） */
  rng?: () => number;
};

export type BuildChoicesResult = {
  choices: Choice[];
  meta: { candidatesUsed: number; randomUsed: number; trapUsed: number; sameLemmaUsed: number };
};

/**
 * 選択肢の組み立て（純粋。ハンドラと検証スクリプトから呼ぶ）。
 * 誤答は「正解と同じ意味として紛れる qid」「正解と同じ語の表記ちがいの qid」を除き、
 * 誤答どうしも同じ意味・同じ表示にならないように選ぶ（src/lib/senseEquivalence）。
 */
export function buildChoices(input: BuildChoicesInput): BuildChoicesResult {
  const { correct, qmap, candidateRows, traps, excludeQids: exclude, mode } = input;
  const rng = input.rng ?? Math.random;
  const allWords = Array.from(qmap.values());
  const byLemma = indexByLemma(allWords);

  // 弁別を鍛える誤答の優先注入（選択肢が「意味」のモードのみ。
  // word-reverse は選択肢が語なので、同一語・罠は成立しない）
  const senseAnswerMode = mode !== "word-reverse";
  const choiceMode: ChoiceMode = senseAnswerMode ? "sense" : "lemma";
  // 既に選んだ誤答。意味の重なり・表示の重複を避けるために持つ（罠は擬似行で入れる）
  const picked: QRow[] = [];
  const usable = (w: QRow) => canUseAsDistractor(w, correct, picked, choiceMode, byLemma);

  const candidateChoices: Choice[] = [];
  for (const data of candidateRows) {
    const candidateData = qmap.get(String(data.qid));
    if (
      candidateData &&
      candidateData.qid !== correct.qid &&
      !exclude.includes(candidateData.qid) &&
      usable(candidateData)
    ) {
      candidateChoices.push({
        qid: candidateData.qid,
        lemma: candidateData.lemma || "",
        sense: candidateData.sense || "",
        freq: data.freq || 0,
        isFromCandidates: true,
      });
    }
  }

  // ① 現代語の罠（古今異義語）。罠の文字列が正解の意味と同じになるものは入れない
  let trapPick: Choice[] = [];
  // ② 同一 lemma の別 sense（多義語内の弁別。例文が文脈を与える前提）。
  //    正解と同じ意味のもの（活用違い・本動詞/補助動詞など）は除く
  let sameLemmaPick: Choice[] = [];
  if (senseAnswerMode) {
    const usableTraps = traps.filter((t) => !trapOverlapsSense(t, correct));
    if (usableTraps.length > 0) {
      const t = usableTraps[Math.floor(rng() * usableTraps.length)];
      const trapRow: QRow = { qid: `trap:${correct.lemma}`, lemma: correct.lemma || "", sense: `〔 ${t} 〕` };
      trapPick = [{ qid: trapRow.qid, lemma: trapRow.lemma, sense: trapRow.sense!, isFromCandidates: false }];
      picked.push(trapRow);
    }
    const sameLemma = allWords.filter(
      (w) =>
        w.lemma === correct.lemma &&
        w.qid !== correct.qid &&
        !exclude.includes(w.qid) &&
        w.sense &&
        w.sense !== correct.sense &&
        usable(w)
    );
    if (sameLemma.length > 0) {
      const w = sameLemma[Math.floor(rng() * sameLemma.length)];
      sameLemmaPick = [{ qid: w.qid, lemma: w.lemma || "", sense: w.sense || "", isFromCandidates: false }];
      picked.push(w);
    }
  }
  const fixedPicks = [...trapPick, ...sameLemmaPick].slice(0, 2);
  const fixedQids = new Set(fixedPicks.map((c) => c.qid));

  const candidateQids = new Set(candidateChoices.map((c) => c.qid));
  const availableRandom = allWords.filter(
    (w) =>
      w.qid !== correct.qid &&
      w.lemma !== correct.lemma && // 同一語はランダム枠に混ぜない（②で管理）
      !exclude.includes(w.qid) &&
      !candidateQids.has(w.qid)
  );
  const shuffled = availableRandom.sort(() => rng() - 0.5);

  const remainAfterFixed = 3 - fixedPicks.length;
  let eligibleCandidates = candidateChoices.filter((c) => !fixedQids.has(c.qid));
  const numFromCandidates = Math.min(2, eligibleCandidates.length, remainAfterFixed);
  // 頻度で重み付けして1つずつ取り、既に選んだ誤答と紛れるものは飛ばす
  const selectedCandidates: Choice[] = [];
  while (selectedCandidates.length < numFromCandidates && eligibleCandidates.length > 0) {
    const [c] = weightedSample(eligibleCandidates, 1, rng);
    eligibleCandidates = eligibleCandidates.filter((x) => x !== c);
    const row = qmap.get(c.qid);
    if (row && usable(row)) {
      selectedCandidates.push(c);
      picked.push(row);
    }
  }
  const numFromRandom = remainAfterFixed - selectedCandidates.length;
  const selectedRandom: Choice[] = [];
  for (const w of shuffled) {
    if (selectedRandom.length >= numFromRandom) break;
    if (!usable(w)) continue;
    selectedRandom.push({ qid: w.qid, lemma: w.lemma || "", sense: w.sense || "", isFromCandidates: false });
    picked.push(w);
  }
  const incorrectOptions = [...fixedPicks, ...selectedCandidates, ...selectedRandom];

  const choices: Choice[] = [
    {
      qid: correct.qid,
      lemma: correct.lemma || "",
      sense: correct.sense || "",
    },
    ...incorrectOptions,
  ].slice(0, 4);

  return {
    choices: choices.sort(() => rng() - 0.5),
    meta: {
      candidatesUsed: selectedCandidates.length,
      randomUsed: selectedRandom.length,
      trapUsed: trapPick.length,
      sameLemmaUsed: sameLemmaPick.length,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { qid, correctQid, excludeQids } = req.query;
    if (!qid || !correctQid) return res.status(400).json({ error: "qid and correctQid required" });

    const qidStr = String(qid);
    const correctQidStr = String(correctQid);
    const exclude = excludeQids ? String(excludeQids).split(",") : [];

    const qmap = loadQuestionsOnce();
    const correctData = qmap.get(correctQidStr);
    if (!correctData) {
      return res.status(404).json({ error: `correctQid not found: ${correctQidStr}` });
    }

    const [acceptRes, negativeRes] = await Promise.all([
      supabaseAdmin
        .from("candidates")
        .select("qid, freq")
        .eq("qid", qidStr)
        .eq("proposed_role", "accept")
        .order("freq", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("candidates")
        .select("qid, freq")
        .eq("qid", qidStr)
        .eq("proposed_role", "negative")
        .order("freq", { ascending: false })
        .limit(15),
    ]);
    if (acceptRes.error) throw acceptRes.error;
    if (negativeRes.error) throw negativeRes.error;

    const mode = String(req.query.mode || "");
    const { choices, meta } = buildChoices({
      correct: correctData,
      qmap,
      candidateRows: [...(acceptRes.data ?? []), ...(negativeRes.data ?? [])],
      traps: loadTrapsOnce()[correctData.lemma] || [],
      excludeQids: exclude,
      mode,
    });

    return res.json({ ok: true, choices, meta });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

function weightedSample<T extends { freq?: number }>(items: T[], count: number, rng: () => number = Math.random): T[] {
  if (items.length === 0) return [];
  if (items.length <= count) return items;
  const totalWeight = items.reduce((sum, item) => sum + (item.freq || 1), 0);
  const selected: T[] = [];
  const remaining = [...items];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    let rand = rng() * totalWeight;
    let picked: T | null = null;
    let pickedIndex = -1;
    for (let j = 0; j < remaining.length; j++) {
      rand -= remaining[j].freq || 1;
      if (rand <= 0) { picked = remaining[j]; pickedIndex = j; break; }
    }
    if (picked) { selected.push(picked); remaining.splice(pickedIndex, 1); }
  }
  return selected;
}
