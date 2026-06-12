// api/getChoices.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import fs from "fs";
import path from "path";

let QMAP: Map<string, any> | null = null;

function loadQuestionsOnce() {
  if (QMAP) return QMAP;
  const p = path.join(process.cwd(), "data", "kobun_q.jsonl.txt");
  if (!fs.existsSync(p)) throw new Error("Data file not found");

  const lines = fs.readFileSync(p, "utf-8").split(/\r?\n/).filter(Boolean);
  QMAP = new Map();
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.qid) QMAP.set(String(obj.qid), obj);
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

    const candidateChoices: Choice[] = [];
    for (const data of [...(acceptRes.data ?? []), ...(negativeRes.data ?? [])]) {
      const candidateQid = data.qid as string;
      const candidateData = qmap.get(candidateQid);
      if (candidateData && candidateData.qid !== correctQidStr && !exclude.includes(candidateData.qid)) {
        candidateChoices.push({
          qid: candidateData.qid,
          lemma: candidateData.lemma || "",
          sense: candidateData.sense || "",
          freq: data.freq || 0,
          isFromCandidates: true,
        });
      }
    }

    const allWords = Array.from(qmap.values());

    // 弁別を鍛える誤答の優先注入（選択肢が「意味」のモードのみ。
    // word-reverse は選択肢が語なので、同一語・罠は成立しない）
    const mode = String(req.query.mode || "");
    const senseAnswerMode = mode !== "word-reverse";

    // ① 同一 lemma の別 sense（多義語内の弁別。例文が文脈を与える前提）
    let sameLemmaPick: Choice[] = [];
    // ② 現代語の罠（古今異義語）
    let trapPick: Choice[] = [];
    if (senseAnswerMode) {
      const sameLemma = allWords.filter(w =>
        w.lemma === correctData.lemma &&
        w.qid !== correctQidStr &&
        !exclude.includes(w.qid) &&
        w.sense && w.sense !== correctData.sense
      );
      if (sameLemma.length > 0) {
        const w = sameLemma[Math.floor(Math.random() * sameLemma.length)];
        sameLemmaPick = [{ qid: w.qid, lemma: w.lemma || "", sense: w.sense || "", isFromCandidates: false }];
      }
      const traps = loadTrapsOnce()[correctData.lemma] || [];
      if (traps.length > 0) {
        const t = traps[Math.floor(Math.random() * traps.length)];
        trapPick = [{
          qid: `trap:${correctData.lemma}`,
          lemma: correctData.lemma || "",
          sense: `〔 ${t} 〕`,
          isFromCandidates: false,
        }];
      }
    }
    const fixedPicks = [...trapPick, ...sameLemmaPick].slice(0, 2);
    const fixedQids = new Set(fixedPicks.map(c => c.qid));

    const candidateQids = new Set(candidateChoices.map(c => c.qid));
    const availableRandom = allWords.filter(w =>
      w.qid !== correctQidStr &&
      w.lemma !== correctData.lemma && // 同一語はランダム枠に混ぜない（①で管理）
      !exclude.includes(w.qid) &&
      !candidateQids.has(w.qid)
    );
    const shuffled = availableRandom.sort(() => Math.random() - 0.5).slice(0, 10);
    const randomChoices: Choice[] = shuffled.map(w => ({
      qid: w.qid,
      lemma: w.lemma || "",
      sense: w.sense || "",
      isFromCandidates: false,
    }));

    const remainAfterFixed = 3 - fixedPicks.length;
    const eligibleCandidates = candidateChoices.filter(c => !fixedQids.has(c.qid));
    const numFromCandidates = Math.min(2, eligibleCandidates.length, remainAfterFixed);
    const selectedCandidates = weightedSample(eligibleCandidates, numFromCandidates);
    const numFromRandom = remainAfterFixed - selectedCandidates.length;
    const selectedRandom = randomChoices.slice(0, numFromRandom);
    const incorrectOptions = [...fixedPicks, ...selectedCandidates, ...selectedRandom];

    const choices: Choice[] = [
      {
        qid: correctData.qid,
        lemma: correctData.lemma || "",
        sense: correctData.sense || "",
      },
      ...incorrectOptions,
    ].slice(0, 4);

    const shuffledChoices = choices.sort(() => Math.random() - 0.5);

    return res.json({
      ok: true,
      choices: shuffledChoices,
      meta: {
        candidatesUsed: selectedCandidates.length,
        randomUsed: selectedRandom.length,
        trapUsed: trapPick.length,
        sameLemmaUsed: sameLemmaPick.length,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

function weightedSample<T extends { freq?: number }>(items: T[], count: number): T[] {
  if (items.length === 0) return [];
  if (items.length <= count) return items;
  const totalWeight = items.reduce((sum, item) => sum + (item.freq || 1), 0);
  const selected: T[] = [];
  const remaining = [...items];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    let rand = Math.random() * totalWeight;
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
