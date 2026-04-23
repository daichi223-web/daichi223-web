import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { normalize } from "./_normalize.js";
import crypto from "crypto";

type ResultLabel = "OK" | "NG" | "ABSTAIN";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    // Action dispatch (C-7 Phase 4-b の migrate を同居)
    const action = (req.body as { action?: string })?.action;
    if (action === "migrate") {
      return await handleMigrate(req, res);
    }

    const { qid, answerRaw, uid, anonId, autoScore, autoResult, autoReason, questionType } = req.body as {
      qid: string;
      answerRaw: string;
      uid?: string | null;
      anonId?: string;
      autoScore: number;
      autoResult: ResultLabel;
      autoReason: string;
      questionType?: 'writing' | 'selection';
    };

    if (!qid || !answerRaw) {
      return res.status(400).json({ error: "qid and answerRaw required" });
    }

    const nowIso = new Date().toISOString();
    const answerNorm = normalize(answerRaw);
    const dedupeKey = crypto.createHash("sha1").update(`${qid}::${answerNorm}`).digest("hex");
    const qType = questionType || "writing";

    const raw = {
      ts: nowIso,
      qid,
      uid: uid || null,
      anonId: anonId || null,
      answerRaw,
      autoAt: nowIso,
      questionType: qType,
      auto: { result: autoResult, score: autoScore, reason: autoReason },
    };
    const curated = {
      v: 1,
      answerNorm,
      dedupeKey,
      flags: {
        pii: false,
        tooLong: answerRaw.length > 200,
        regexRisk: /[.*+?^${}()|[\]\\]/.test(answerRaw),
      },
    };
    let finalObj: any = {
      result: autoResult,
      source: "auto",
      reason: autoReason,
      at: nowIso,
    };

    // Check for existing override
    const { data: ov, error: ovErr } = await supabaseAdmin
      .from("overrides")
      .select("label, active, reason, created_by")
      .eq("qid", qid)
      .eq("answer_norm", answerNorm)
      .maybeSingle();
    if (ovErr) throw ovErr;

    if (ov && ov.active) {
      finalObj = {
        result: ov.label,
        source: "override",
        reason: `override:${qid}::${answerNorm}${ov.reason ? " - " + ov.reason : ""}`,
        by: ov.created_by || "system",
        at: nowIso,
      };
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("answers")
      .insert({
        qid,
        answer_norm: answerNorm,
        question_type: qType,
        raw,
        curated,
        manual: null,
        final: finalObj,
        created_at: nowIso,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return res.json({
      ok: true,
      answerId: inserted!.id,
      final: finalObj,
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

/**
 * C-7 Phase 4-b: legacy 'anon_<uuid>' user_id を auth.uid に rekey する。
 * toUserId が既に word_stats にデータを持っていたら skip（= 既に使われている
 * アカウント）。空なら word_stats / srs_state を rekey。
 *
 * 入力の toUserId はクライアント申告だが、orphan 行を吸収するだけなので
 * なりすましリスクは低い（他ユーザーの有効データには触れない）。
 */
async function handleMigrate(req: VercelRequest, res: VercelResponse) {
  const { fromUserId, toUserId } = (req.body || {}) as {
    fromUserId?: string;
    toUserId?: string;
  };

  if (!fromUserId || !toUserId) {
    return res.status(400).json({ error: "fromUserId and toUserId required" });
  }
  if (!fromUserId.startsWith("anon_")) {
    return res.status(400).json({ error: "fromUserId must start with anon_" });
  }
  if (!/^[0-9a-f-]{36}$/i.test(toUserId)) {
    return res.status(400).json({ error: "toUserId must be a UUID" });
  }
  if (fromUserId === toUserId) {
    return res.status(400).json({ error: "fromUserId == toUserId" });
  }

  // toUserId が既にデータを持っているなら skip (= 既アクティブ)
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("word_stats")
    .select("id")
    .eq("user_id", toUserId)
    .limit(1);
  if (exErr) {
    return res.status(500).json({ error: String(exErr.message || exErr) });
  }
  if (existing && existing.length > 0) {
    return res.json({ ok: true, migrated: { skipped: true, reason: "target already has data" } });
  }

  // rekey: word_stats
  const { data: wsUpdated, error: wsErr } = await supabaseAdmin
    .from("word_stats")
    .update({ user_id: toUserId })
    .eq("user_id", fromUserId)
    .select("id");
  if (wsErr) {
    return res.status(500).json({ error: `word_stats rekey failed: ${wsErr.message}` });
  }

  // rekey: srs_state (ベストエフォート、失敗しても word_stats 側は保持)
  const { data: srsUpdated, error: srsErr } = await supabaseAdmin
    .from("srs_state")
    .update({ user_id: toUserId })
    .eq("user_id", fromUserId)
    .select("user_id");

  return res.json({
    ok: true,
    migrated: {
      word_stats: wsUpdated?.length || 0,
      srs_state: srsErr ? 0 : srsUpdated?.length || 0,
      srs_error: srsErr ? String(srsErr.message) : null,
    },
  });
}
