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
import { updateSrsState, getDueWords, startOfToday } from "@/lib/srsEngine";
import type { GrammarDrill, GrammarDrillKind, GrammarMedia, TopicProgress } from "@/lib/kobun/types";
import { levelOfSort, levelsByTopic } from "@/lib/kobun/topicStatus";
import { pickTodayReview, DOJO_REVIEW_CAP, type SrsDueRow, type TodayReview } from "@/lib/kobun/dojoReview";

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
  return levelOfSort(d.sort); // 式は topicStatus.ts に1つだけ置く（単元の状態の判定と共用）
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

/** 複数単元のドリルをまとめて取得（学び始めの判定用。sort 昇順） */
export async function fetchDrillsForTopics(topicIds: string[]): Promise<GrammarDrill[]> {
  if (topicIds.length === 0) return [];
  const { data, error } = await supabase
    .from("grammar_drills")
    .select("id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort")
    .in("topic_id", topicIds)
    .order("sort", { ascending: true });

  if (error || !data) {
    console.warn("[dojo] fetchDrillsForTopics failed:", error);
    return [];
  }

  return data.map(toDrill);
}

/**
 * SRS の期日が到来した文法ドリルを、単元を横断して取得する（復習導線）。
 * - getDueWords() は単語 qid も含むため、grammar_drills 側で id 一致のみ拾う
 *   ＝ 文法ドリルだけが残る（単語の段位は混ざらない）。
 * - シャッフルして最大 limit 問に切る。0件＝復習なしを意味する。
 * ※ 2026-11-06 から、復習の画面とバッジは下の fetchTodayReview・fetchTodayReviewCount（今日の分）を使う。
 *   この関数と fetchDueDrillCount は期日の ID を全部 URL に並べる取り方のままで、いまは呼び出し元が無い。
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

// ---------------------------------------------------------------------------
// 失敗がわかる取得（2026-11-06。見直し ②③⑩）
//   上の fetchDojoTopicIds・fetchDueDrills・getAllTopicProgress などは、通信に失敗すると空を返す。
//   画面からは「まだ無い」と「読み込めなかった」の区別が付かないので、道場ホーム・復習・単語道場は
//   こちら（失敗したら例外を投げる）を使い、「読み込めませんでした／もう一度」を出す。
//   上の関数は単元ページなどが使っているので、引数・戻り値はそのままにしてある。
// ---------------------------------------------------------------------------

/** 文法の問題の索引（ID・単元・sort）。1回取って覚える */
export interface DrillIndexRow {
  id: string;
  topicId: string;
  sort: number;
}

/** 1回の取得で返る行数が上限で切られたときの、続きの取り方の単位 */
const PAGE_SIZE = 1000;

let drillIndexCache: Promise<DrillIndexRow[]> | null = null;

/**
 * 文法の問題の索引を取る（失敗したら例外）。
 * 単元の一覧・単元ごとの「あるレベル」・復習の「文法の問題かどうか」の3つに使うので、
 * 画面を移っても取り直さないよう覚えておく（失敗したときは覚えず、次の呼び出しで取り直す）。
 * 行数が上限で切られていたら（総数より少なければ）続きを取りに行く。
 */
export function fetchDrillIndex(): Promise<DrillIndexRow[]> {
  if (drillIndexCache) return drillIndexCache;
  const p = (async () => {
    const rows: { id: string; topic_id: string; sort: number | null }[] = [];
    let total = Infinity;
    while (rows.length < total) {
      const q = supabase
        .from("grammar_drills")
        .select("id, topic_id, sort", { count: "exact" })
        .order("id", { ascending: true });
      // 1回目は範囲を付けない（これまでと同じ取り方）。切られていたときだけ続きを範囲で取る
      const { data, error, count } = await (rows.length === 0 ? q : q.range(rows.length, rows.length + PAGE_SIZE - 1));
      if (error || !data) throw error ?? new Error("grammar_drills: no data");
      rows.push(...data);
      total = count ?? rows.length;
      if (data.length === 0) break;
    }
    return rows.map((r) => ({ id: r.id, topicId: r.topic_id, sort: r.sort ?? 0 }));
  })();
  drillIndexCache = p;
  p.catch(() => {
    if (drillIndexCache === p) drillIndexCache = null;
  });
  return p;
}

/**
 * ドリルがある単元と、その単元にあるレベル（小さい順）。失敗したら例外。
 * fetchDojoTopicIds の「レベルも分かる・失敗が分かる」版（単元の状態の判定に使う）。
 */
export async function fetchDojoTopicLevels(): Promise<Record<string, number[]>> {
  return levelsByTopic(await fetchDrillIndex());
}

/** 全単元の到達度。getAllTopicProgress の「失敗したら例外」版 */
export async function getAllTopicProgressOrThrow(): Promise<Record<string, TopicProgress>> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("grammar_topic_progress")
    .select("topic_id, watched, drill_total, drill_correct, mastery_pct")
    .eq("user_id", userId);
  if (error || !data) throw error ?? new Error("grammar_topic_progress: no data");

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

/** 期日が来た srs_state の行（単語・例文事典の分も含む。絞るのは pickTodayReview）。失敗したら例外 */
async function fetchDueSrsRows(now: Date): Promise<SrsDueRow[]> {
  const userId = await getUserId();
  const rows: { qid: string; next_review: string; last_review: string | null }[] = [];
  let total = Infinity;
  while (rows.length < total) {
    const q = supabase
      .from("srs_state")
      .select("qid, next_review, last_review", { count: "exact" })
      .eq("user_id", userId)
      .lte("next_review", now.toISOString())
      .order("next_review", { ascending: true })
      .order("qid", { ascending: true });
    const { data, error, count } = await (rows.length === 0 ? q : q.range(rows.length, rows.length + PAGE_SIZE - 1));
    if (error || !data) throw error ?? new Error("srs_state: no data");
    rows.push(...data);
    total = count ?? rows.length;
    if (data.length === 0) break;
  }
  return rows.map((r) => ({ qid: r.qid, nextReview: r.next_review, lastReview: r.last_review }));
}

/**
 * 復習の「今日の分」の ID と残りの数（決め方は dojoReview.pickTodayReview）。失敗したら例外。
 * 以前は期日が来た ID を全部 URL に並べて grammar_drills に問い合わせていた（数百件で URL が長すぎて
 * 失敗するおそれ）。いまは問題の索引と srs_state の行を手元で突き合わせる。
 */
async function resolveTodayReview(exclude?: ReadonlySet<string>): Promise<TodayReview> {
  const now = new Date();
  const [index, rows] = await Promise.all([fetchDrillIndex(), fetchDueSrsRows(now)]);
  return pickTodayReview(rows, new Set(index.map((r) => r.id)), {
    now,
    todayStart: startOfToday(now),
    cap: DOJO_REVIEW_CAP,
    exclude,
  });
}

/** 復習の「今日の分」の問題数（道場ホームの復習カード・教材一覧の文法道場ボタンのバッジ用）。失敗したら例外 */
export async function fetchTodayReviewCount(): Promise<number> {
  return (await resolveTodayReview()).ids.length;
}

/**
 * 復習の「今日の分」の問題（期日の古い順・最大20問）と、残りの数。失敗したら例外。
 * exclude = この画面ですでに出した問題（「つづけてもう少し」で同じ問題を出さないため）。
 */
export async function fetchTodayReview(
  exclude?: ReadonlySet<string>
): Promise<{ drills: GrammarDrill[]; remaining: number }> {
  const { ids, remaining } = await resolveTodayReview(exclude);
  if (ids.length === 0) return { drills: [], remaining };

  // ここで URL に並ぶ ID は多くても上限（20）個
  const { data, error } = await supabase
    .from("grammar_drills")
    .select("id, topic_id, kind, prompt, context, choices, answer, explanation, ref_heading, sort")
    .in("id", ids);
  if (error || !data) throw error ?? new Error("grammar_drills: no data");

  const byId = new Map(data.map((r) => [r.id as string, toDrill(r)]));
  const drills = ids.map((id) => byId.get(id)).filter((d): d is GrammarDrill => d !== undefined);
  return { drills, remaining };
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
