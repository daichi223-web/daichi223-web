/**
 * 単語クイズの出題に要る材料の読み込み（2026-11-16 に src/App.tsx から切り出した）。
 *
 *   ファイル（初回だけ通信）… 空欄の例文・実戦例文・例文ごとの手当て
 *   学習の記録（まとめ読み）  … 成績・箱・期限（lib/learningSnapshot）
 *
 * 出題の組み立て（./wordQuiz の buildWordQuiz）は、ここで取ったものを受け取るだけで通信しない。
 * ファイルと記録は同時に取る。ファイルはアプリを開いた時点で先に読み始める（preloadWordQuizFiles）。
 */
import { loadBlanks, type BlankEntry } from '../blanksLoader';
import type { ExampleContextMap } from '../exampleContext';
import { EMPTY_SNAPSHOT, boxesOf, dueAmongOf, loadLearningSnapshot, statsMapOf } from '../learningSnapshot';
import type { CorpusExample, WordQuizRecords } from './wordQuiz';

/** 取れたら覚え、取れなかったら次の呼び出しでもう一度試す（空のまま覚えない） */
function cachedJson<T>(url: string): () => Promise<T | null> {
  let cache: T | null = null;
  let inflight: Promise<T | null> | null = null;
  return () => {
    if (cache) return Promise.resolve(cache);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await fetch(url);
        if (res.ok) cache = (await res.json()) as T;
      } catch {
        /* 取れなければ無しで出題する */
      }
      inflight = null;
      return cache;
    })();
    return inflight;
  };
}

// 教材実例文（qid → 例文[]）。箱（単語レベル）が上がった語の出題に使う
const corpusLoader = cachedJson<Record<string, CorpusExample[]>>('/corpus-examples.json');
// 例文ごとの手当て（誤答に出さない意味・前後の本文・補足）。正本 data/enrich/example-context.jsonl → scripts/build-example-context.mjs
const contextLoader = cachedJson<ExampleContextMap>('/example-context.json');

export async function loadCorpusExamples(): Promise<Record<string, CorpusExample[]>> {
  return (await corpusLoader()) ?? {};
}

export async function loadExampleContext(): Promise<ExampleContextMap> {
  return (await contextLoader()) ?? {};
}

/** アプリを開いたときに呼ぶ。出題を作るころには読み終わっているように、先に読み始める */
export function preloadWordQuizFiles(): void {
  void loadBlanks();
  void loadCorpusExamples();
  void loadExampleContext();
}

export type WordQuizFiles = {
  blanks: Record<string, BlankEntry[]>;
  corpus: Record<string, CorpusExample[]>;
  exampleContexts: ExampleContextMap;
};

/** needBlanks = 空欄・おまかせのときだけ空欄の例文（約480KB）を取る */
export async function loadWordQuizFiles(needBlanks: boolean): Promise<WordQuizFiles> {
  const [blanks, corpus, exampleContexts] = await Promise.all([
    needBlanks ? loadBlanks() : Promise.resolve({} as Record<string, BlankEntry[]>),
    loadCorpusExamples(),
    loadExampleContext(),
  ]);
  return { blanks, corpus, exampleContexts };
}

/**
 * 出題の候補（qids）の学習の記録。まとめ読み（lib/learningSnapshot）から取り出す。
 * ホームで読んだものが残っていれば通信しない。
 *   箱   … いつも（実戦例文への差し替えと、おまかせの問い方に使う）
 *   成績・期限 … 出す語をおまかせで選ぶときだけ
 * 取れなかったときは、今までと同じく「記録なし」（全部未学習）として続ける。出題は止めない。
 */
export async function loadWordQuizRecords(qids: string[], autoPick: boolean): Promise<WordQuizRecords> {
  const snap = await loadLearningSnapshot().catch(() => EMPTY_SNAPSHOT);
  return {
    stats: autoPick ? statsMapOf(snap) : null,
    boxes: boxesOf(snap, qids),
    due: autoPick ? dueAmongOf(snap, qids) : [],
  };
}
