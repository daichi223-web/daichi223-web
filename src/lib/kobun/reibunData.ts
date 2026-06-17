/**
 * 助動詞例文集 — Supabase からの取得（公開read）。
 * - grammar_reibun: 例文235（うち is_quiz=174 が出題対象）
 * - grammar_jodoshi_meanings: 助動詞×意味23（決め手の総則・選択肢生成元）
 * 例文事典（案B）と意味判別出題（案A）の共通データ層。
 */
import { supabase } from "@/lib/supabase";
import type { GrammarReibun, GrammarJodoshiMeaning } from "@/lib/kobun/types";

// 助動詞の表示順（例文集に合わせる）
export const JODOSHI_ORDER = [
  "けり", "つ", "ぬ", "たり", "り", "まじ", "けむ", "らむ", "ごとし",
];

function toReibun(r: Record<string, unknown>): GrammarReibun {
  return {
    id: r.id as string,
    jodoshi: r.jodoshi as string,
    meaningKey: r.meaning_key as string,
    meaning: r.meaning as string,
    sentence: r.sentence as string,
    translation: r.translation as string,
    source: r.source as string,
    workKey: (r.work_key as string | null) ?? undefined,
    context: (r.context as string | null) ?? undefined,
    decider: (r.decider as string | null) ?? undefined,
    period: (r.period as string | null) ?? undefined,
    confidence: r.confidence as GrammarReibun["confidence"],
    verified: r.verified as boolean,
    isQuiz: r.is_quiz as boolean,
    layer: (r.layer as GrammarReibun["layer"]) ?? undefined,
  };
}

function toMeaning(r: Record<string, unknown>): GrammarJodoshiMeaning {
  return {
    meaningKey: r.meaning_key as string,
    jodoshi: r.jodoshi as string,
    meaning: r.meaning as string,
    deciderRule: r.decider_rule as string,
  };
}

/** 例文を全件取得（助動詞→意味→sort で整列） */
export async function fetchAllReibun(): Promise<GrammarReibun[]> {
  const { data, error } = await supabase
    .from("grammar_reibun")
    .select(
      "id, jodoshi, meaning_key, meaning, sentence, translation, source, work_key, context, decider, period, confidence, verified, is_quiz, layer"
    )
    .order("meaning_key", { ascending: true })
    .order("sort", { ascending: true });

  if (error || !data) {
    console.warn("[reibun] fetchAllReibun failed:", error);
    return [];
  }
  const rows = data.map(toReibun);
  rows.sort(
    (a, b) =>
      JODOSHI_ORDER.indexOf(a.jodoshi) - JODOSHI_ORDER.indexOf(b.jodoshi) ||
      a.meaningKey.localeCompare(b.meaningKey)
  );
  return rows;
}

/** 意味マスタを全件取得（決め手の総則・選択肢生成元） */
export async function fetchMeanings(): Promise<GrammarJodoshiMeaning[]> {
  const { data, error } = await supabase
    .from("grammar_jodoshi_meanings")
    .select("meaning_key, jodoshi, meaning, decider_rule")
    .order("sort", { ascending: true });

  if (error || !data) {
    console.warn("[reibun] fetchMeanings failed:", error);
    return [];
  }
  return data.map(toMeaning);
}
