// 教員画面の API 束ね口。
//
// Vercel Hobby は Serverless Function 12本が上限のため、7本あった教員用エンドポイントを
// この1本に集約する。中身は元のハンドラをそのまま（api/_teacher_*.ts）呼ぶだけで、
// 認可（requireStaff）・メソッド判定・入出力はいずれも各ハンドラ側の実装を変えていない。
//
// 呼び方:
//   GET  /api/teacher?action=listRecentAnswers&limit=50
//   POST /api/teacher?action=overrideAnswer     body: { answerId, result }
// action は query（cron から使う）と body の両方を受ける。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import aggregateCandidates from "./_teacher_aggregateCandidates.js";
import deleteAllData from "./_teacher_deleteAllData.js";
import exportCandidatesJSON from "./_teacher_exportCandidatesJSON.js";
import listCandidates from "./_teacher_listCandidates.js";
import listRecentAnswers from "./_teacher_listRecentAnswers.js";
import overrideAnswer from "./_teacher_overrideAnswer.js";
import upsertOverride from "./_teacher_upsertOverride.js";
import { getQuizRange, setQuizRange } from "./_teacher_quizRange.js";
import usageData from "./_teacher_usageData.js";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

const ROUTES: Record<string, Handler> = {
  aggregateCandidates,
  deleteAllData,
  exportCandidatesJSON,
  listCandidates,
  listRecentAnswers,
  overrideAnswer,
  upsertOverride,
  getQuizRange,
  setQuizRange,
  usageData,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fromQuery = typeof req.query.action === "string" ? req.query.action : undefined;
  const fromBody = (req.body as { action?: string } | undefined)?.action;
  const action = fromQuery ?? fromBody;

  if (!action) return res.status(400).json({ error: "action required" });
  const route = ROUTES[action];
  if (!route) return res.status(404).json({ error: `unknown action: ${action}` });

  return await route(req, res);
}
