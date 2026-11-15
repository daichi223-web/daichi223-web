import { STORAGE_KEYS } from '../storageKeys';

/**
 * 文法道場の「つづきから」と「ここから」を端末に覚える（2026-11-06。見直し ①⑧）。
 *   lastTopic  … 最後にドリルを始めた単元とレベル。単元ページ（GrammarDojoTopic）が書き、道場ホームが「つづきから」に使う
 *   startPoint … 学び始めの判定が決めた出発点の単元。学び始め（Manabinaoshi）が書き、道場ホームが「ここから」に使う
 *   lessonDone … 「先生と学ぶ」レッスンを最後まで終えた単元（2026-11-15）。単元ページが、どちらのボタンを主にするかに使う
 * 学習の記録（到達度・SRS）ではなく道しるべなので、端末ごとの localStorage に置く。壊れた値・読めない環境では null。
 */

export type DojoLastTopic = { topicId: string; level: number; at: string };
export type DojoStartPoint = { stage: number; topicId: string; at: string };

function read<T>(key: string, ok: (v: Record<string, unknown>) => boolean): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && ok(v as Record<string, unknown>) ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できなくても学習は続ける */
  }
}

export function readDojoLastTopic(): DojoLastTopic | null {
  return read<DojoLastTopic>(STORAGE_KEYS.dojoLastTopic, (v) => typeof v.topicId === 'string' && typeof v.level === 'number');
}

export function writeDojoLastTopic(topicId: string, level: number, now: Date = new Date()): void {
  write(STORAGE_KEYS.dojoLastTopic, { topicId, level, at: now.toISOString() });
}

export function readDojoStartPoint(): DojoStartPoint | null {
  return read<DojoStartPoint>(STORAGE_KEYS.dojoStartPoint, (v) => typeof v.topicId === 'string' && typeof v.stage === 'number');
}

export function writeDojoStartPoint(stage: number, topicId: string, now: Date = new Date()): void {
  write(STORAGE_KEYS.dojoStartPoint, { stage, topicId, at: now.toISOString() });
}

/** 「先生と学ぶ」を最後まで終えた単元の ID。壊れた値・読めない環境では空 */
export function readLessonDone(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.dojoLessonDone) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markLessonDone(topicId: string): void {
  const done = readLessonDone();
  if (!done.includes(topicId)) write(STORAGE_KEYS.dojoLessonDone, [...done, topicId]);
}
