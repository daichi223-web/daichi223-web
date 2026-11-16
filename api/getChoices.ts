// api/getChoices.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import fs from "fs";
import path from "path";
// 選択肢の組み立ては src/lib/quiz/choices.ts（ブラウザと共通。2026-11-16 に移した）
import { buildChoices, type QRow } from "../src/lib/quiz/choices.js";

export { buildChoices };
export type { QRow, BuildChoicesInput, BuildChoicesResult } from "../src/lib/quiz/choices.js";
// 同義判定に使う senseNorm・pos は data/kobun_q.jsonl.txt に無いので slim から補う
// （約700KB。関数に同梱され、読み込みはコールドスタート時の1回）
import slimJson from "../src/data/kobunQ.v2.slim.json" with { type: "json" };


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
