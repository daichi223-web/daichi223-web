/**
 * 文法道場 — Supabase からのデータ取得と進捗管理。
 *
 * - コンテンツ: grammar_drills / grammar_media（公開read）
 * - 動画: Storage バケット `grammar-videos`（mp4・公開バケット）
 * - 反復: 既存 srs_state / word_stats を qid 流用（qid = drill.id）
 *         → fieldMastery.ts は kobunQ.json の単語 group のみ集計するため、
 *           文法 qid を混ぜても単語の段位は汚れない。
 * - 単元到達度: grammar_topic_progress（per-user, RLS=auth.uid）
 */
import { supabase } from "@/lib/supabase";
import { getUserId, recordAnswer } from "@/lib/wordStats";
import { updateSrsState, getDueWords } from "@/lib/srsEngine";
import type { GrammarDrill, GrammarDrillKind, GrammarMedia, TopicProgress } from "@/lib/kobun/types";

const VIDEO_BUCKET = "grammar-videos";

/**
 * 動画配信のベースURL。既定で Cloudflare R2（egress 無料）の公開URLから配信する。
 * VITE_VIDEO_BASE_URL を設定すれば上書き可能（例: 学校フィルタ対策のカスタムドメイン）。
 * 明示的に空文字を渡したときのみ Supabase Storage にフォールバックする。
 * R2例: https://<bucket>.<account>.r2.dev ／ カスタム例: https://video.example.com
 */
const VIDEO_BASE = (
  import.meta.env.VITE_VIDEO_BASE_URL ?? "https://pub-03c03199b45c473baa4b74b29d521416.r2.dev"
).replace(/\/+$/, "");

/** grammar_drills の行 → GrammarDrill へ正規化 */
function toDrill(r: {
  id: string;
  topic_id: string;
  kind: string;
  prompt: string;
  context: string | null;
  choices: unknown;
  answer: unknown;
  explanation: string;
  ref_heading: string | null;
  sort?: number | null;
}): GrammarDrill {
  return {
    id: r.id,
    topicId: r.topic_id,
    kind: r.kind as GrammarDrillKind,
    prompt: r.prompt,
    context: r.context ?? undefined,
    choices: (r.choices as string[] | null) ?? undefined,
    answer: r.answer as string | string[],
    explanation: r.explanation,
    refHeading: r.ref_heading ?? undefined,
    sort: r.sort ?? undefined,
  };
}

/** sort の100の位 = 難度レベル（<100=Lv1, 100台=Lv2, …, 400台=Lv5 難関） */
export function drillLevel(d: GrammarDrill): number {
  const s = d.sort ?? 0;
  return Math.min(5, Math.floor(s / 100) + 1);
}

/** バケット内パス → 公開 URL（R2 設定時は R2、未設定なら Supabase Storage） */
export function videoUrl(storagePath: string): string {
  if (VIDEO_BASE) return `${VIDEO_BASE}/${storagePath}`;
  return supabase.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** 単元のドリルを取得（sort 昇順） */
export async function fetchDrills(topicId: string): Promise<GrammarDrill[]> {
  const { data, error } = await supabase
    .from("grammar_drills")
    .select("id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort")
    .eq("topic_id", topicId)
    .order("sort", { ascending: true });

  if (error || !data) {
    console.warn("[dojo] fetchDrills failed:", error);
    return [];
  }

  return data.map(toDrill);
}

/**
 * SRS の期日が到来した文法ドリルを、単元を横断して取得する（復習導線）。
 * - getDueWords() は単語 qid も含むため、grammar_drills 側で id 一致のみ拾う
 *   ＝ 文法ドリルだけが残る（単語の段位は混ざらない）。
 * - シャッフルして最大 limit 問に切る。0件＝復習なしを意味する。
 */
export async function fetchDueDrills(limit = 20): Promise<GrammarDrill[]> {
  const dueQids = await getDueWords();
  if (dueQids.length === 0) return [];

  const { data, error } = await supabase
    .from("grammar_drills")
    .select("id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort")
    .in("id", dueQids);

  if (error || !data) {
    console.warn("[dojo] fetchDueDrills failed:", error);
    return [];
  }

  const drills = data.map(toDrill);
  for (let i = drills.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [drills[i], drills[j]] = [drills[j], drills[i]];
  }
  return drills.slice(0, limit);
}

/** 期日到来の文法ドリル件数（道場ホームの復習バッジ用）。DB側で絞り込む。 */
export async function fetchDueDrillCount(): Promise<number> {
  const dueQids = await getDueWords();
  if (dueQids.length === 0) return 0;

  const { count, error } = await supabase
    .from("grammar_drills")
    .select("id", { count: "exact", head: true })
    .in("id", dueQids);

  if (error || count === null) {
    console.warn("[dojo] fetchDueDrillCount failed:", error);
    return 0;
  }
  return count;
}

/** 単元の講義動画を取得（sort 昇順） */
export async function fetchMedia(topicId: string): Promise<GrammarMedia[]> {
  const { data, error } = await supabase
    .from("grammar_media")
    .select("kind, storage_path, title, sec, poster_path, sort")
    .eq("topic_id", topicId)
    .order("sort", { ascending: true });

  if (error || !data) {
    console.warn("[dojo] fetchMedia failed:", error);
    return [];
  }

  return data.map((r) => ({
    kind: r.kind,
    storagePath: r.storage_path,
    title: r.title,
    sec: r.sec ?? undefined,
    posterPath: r.poster_path ?? undefined,
  }));
}

/** コンテンツ（ドリル）が存在する単元 topic_id 一覧（道場ホーム用） */
export async function fetchDojoTopicIds(): Promise<string[]> {
  const { data, error } = await supabase.from("grammar_drills").select("topic_id");
  if (error || !data) {
    console.warn("[dojo] fetchDojoTopicIds failed:", error);
    return [];
  }
  return Array.from(new Set(data.map((r) => r.topic_id as string)));
}

/** ドリル1問の解答を記録（正誤数 + SRS箱）。qid = drill.id */
export async function recordDrillAnswer(drillId: string, isCorrect: boolean): Promise<void> {
  await recordAnswer(drillId, isCorrect);
  await updateSrsState(drillId, isCorrect);
}

/** 全単元の到達度を取得（道場ホーム用） */
export async function getAllTopicProgress(): Promise<Record<string, TopicProgress>> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("grammar_topic_progress")
    .select("topic_id, watched, drill_total, drill_correct, mastery_pct")
    .eq("user_id", userId);

  if (error || !data) {
    console.warn("[dojo] getAllTopicProgress failed:", error);
    return {};
  }

  const out: Record<string, TopicProgress> = {};
  for (const r of data) {
    out[r.topic_id] = {
      topicId: r.topic_id,
      watched: r.watched,
      drillTotal: r.drill_total,
      drillCorrect: r.drill_correct,
      masteryPct: r.mastery_pct,
    };
  }
  return out;
}

/** 視聴フラグを立てる（冪等 upsert） */
export async function markWatched(topicId: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from("grammar_topic_progress").upsert(
    {
      user_id: userId,
      topic_id: topicId,
      watched: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,topic_id" }
  );
  if (error) console.warn("[dojo] markWatched failed:", error);
}

/** ドリルセッション結果で到達度を更新（冪等 upsert） */
export async function saveTopicResult(
  topicId: string,
  result: { drillTotal: number; drillCorrect: number; masteryPct: number }
): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from("grammar_topic_progress").upsert(
    {
      user_id: userId,
      topic_id: topicId,
      drill_total: result.drillTotal,
      drill_correct: result.drillCorrect,
      mastery_pct: result.masteryPct,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,topic_id" }
  );
  if (error) console.warn("[dojo] saveTopicResult failed:", error);
}
