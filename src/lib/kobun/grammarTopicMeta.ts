/**
 * 文法の単元の「一覧に要る項目」（題名・要約・分野・layer）。
 * 単元の JSON（public/grammar/<id>.json）を何十個も取らずに済むよう、同梱の小さな索引
 * （src/data/grammarTopicIndex.json。scripts/build-grammar-index.mjs で生成）から引く。
 * 索引に無い単元（足したばかりで索引を回していない）は、従来どおり単元の JSON を取りに行く。
 */
import type { GrammarTopic, LayerId } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import indexJson from "@/data/grammarTopicIndex.json";

export interface TopicMeta {
  id: string;
  title: string;
  summary: string;
  layer: LayerId;
  category: string;
}

type IndexEntry = { title: string; summary: string; layer: number; category: string };
const INDEX = indexJson as unknown as Record<string, IndexEntry>;

/** 索引にある単元の項目（同期）。無ければ undefined */
export function topicMetaFromIndex(id: string): TopicMeta | undefined {
  const e = Object.prototype.hasOwnProperty.call(INDEX, id) ? INDEX[id] : undefined;
  return e ? { id, title: e.title, summary: e.summary, layer: e.layer as LayerId, category: e.category } : undefined;
}

/**
 * 単元の項目を取る。索引にあればそのまま（通信なし）、無ければ単元の JSON を取る。
 * 取れなかった（通信の失敗・単元が無い）ときは null。
 */
export async function fetchTopicMeta(id: string): Promise<TopicMeta | null> {
  const hit = topicMetaFromIndex(id);
  if (hit) return hit;
  const r = await fetchJsonAsset<GrammarTopic>(`/grammar/${id}.json`);
  return r.ok
    ? { id, title: r.data.title, summary: r.data.summary, layer: r.data.layer, category: r.data.category }
    : null;
}

/** 複数の単元の項目を同時に取る（取れなかった単元は結果に入らない）。索引にある分は通信しない */
export async function fetchTopicMetas(ids: string[]): Promise<TopicMeta[]> {
  const list = await Promise.all(ids.map(fetchTopicMeta));
  return list.filter((m): m is TopicMeta => m !== null);
}
