// 例文事典・例文クイズ用：助動詞の例文集と意味マスタの読み込み（このセッションの間は取り直さない）。
// 例文集はアプリを使っている間に変わらないので、取れたらモジュール内に覚える。
// 取れなかったとき（空・通信失敗）は覚えない＝次に開いたとき取り直す（lib/blanksLoader.ts と同じ型）。
import { fetchAllReibun, fetchMeanings } from "./reibunData";
import type { GrammarJodoshiMeaning, GrammarReibun } from "./types";

let reibunCache: GrammarReibun[] | null = null;
let reibunInflight: Promise<GrammarReibun[]> | null = null;
let meaningsCache: GrammarJodoshiMeaning[] | null = null;
let meaningsInflight: Promise<GrammarJodoshiMeaning[]> | null = null;

function cached<T>(
  get: () => T[] | null,
  set: (v: T[] | null) => void,
  getInflight: () => Promise<T[]> | null,
  setInflight: (p: Promise<T[]> | null) => void,
  fetcher: () => Promise<T[]>,
): Promise<T[]> {
  const hit = get();
  if (hit) return Promise.resolve(hit);
  const running = getInflight();
  if (running) return running;
  const p = (async () => {
    try {
      const rows = await fetcher();
      if (rows.length > 0) set(rows); // 空は失敗とみなして覚えない
      return rows;
    } finally {
      setInflight(null);
    }
  })();
  setInflight(p);
  return p;
}

export function loadReibun(): Promise<GrammarReibun[]> {
  return cached(
    () => reibunCache,
    (v) => (reibunCache = v),
    () => reibunInflight,
    (p) => (reibunInflight = p),
    fetchAllReibun,
  );
}

export function loadMeanings(): Promise<GrammarJodoshiMeaning[]> {
  return cached(
    () => meaningsCache,
    (v) => (meaningsCache = v),
    () => meaningsInflight,
    (p) => (meaningsInflight = p),
    fetchMeanings,
  );
}

/** 例文と意味マスタを同時に取る（2回目以降は通信しない） */
export function loadReibunAndMeanings(): Promise<[GrammarReibun[], GrammarJodoshiMeaning[]]> {
  return Promise.all([loadReibun(), loadMeanings()]);
}
