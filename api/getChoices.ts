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
    const candidateQids = new Set(candidateChoices.map(c => c.qid));
    const availableRandom = allWords.filter(w =>
      w.qid !== correctQidStr &&
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

    const numFromCandidates = Math.min(2, candidateChoices.length);
    const numFromRandom = 3 - numFromCandidates;
    const selectedCandidates = weightedSample(candidateChoices, numFromCandidates);
    const selectedRandom = randomChoices.slice(0, numFromRandom);
    const incorrectOptions = [...selectedCandidates, ...selectedRandom];

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
