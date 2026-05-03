/**
 * 古文読み v3 — localStorage ベースの進捗管理
 */

import type { ReadingProgress, LayerId } from "./types";

const STORAGE_KEY = "kobun-yomi-progress";
const VOCAB_KEY = "kobun-yomi-vocab";
const OPEN_COUNTER_KEY = "kobun-yomi-opens";

/* ═══════════════════════════════════════════
   単語帳
   ═══════════════════════════════════════════ */

export interface VocabEntry {
  tokenText: string;
  baseForm: string;
  pos: string;
  hint?: string;
  textId: string;
  grammarRefId?: string;
  viewedAt: string;
}

export function getVocabEntries(): VocabEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VOCAB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addVocabEntry(entry: VocabEntry): void {
  const entries = getVocabEntries();
  const key = `${entry.baseForm}:${entry.pos}`;
  if (entries.some((e) => `${e.baseForm}:${e.pos}` === key)) return;
  entries.push(entry);
  try {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(entries));
  } catch {
    // storage full
  }
}

export function removeVocabEntry(baseForm: string, pos: string): void {
  const entries = getVocabEntries().filter(
    (e) => !(e.baseForm === baseForm && e.pos === pos)
  );
  try {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(entries));
  } catch {
    // storage full
  }
}

/* ═══════════════════════════════════════════
   進捗管理
   ═══════════════════════════════════════════ */

export function loadAllProgress(): Record<string, ReadingProgress> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, ReadingProgress>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage full — silently fail
  }
}

export function getProgress(textId: string): ReadingProgress | null {
  return loadAllProgress()[textId] ?? null;
}

export function markTokenViewed(textId: string, tokenId: string): void {
  const all = loadAllProgress();
  const existing = all[textId];
  if (!existing) return;

  if (!existing.tokensViewed.includes(tokenId)) {
    existing.tokensViewed.push(tokenId);
    existing.lastReadAt = new Date().toISOString();
    saveAll(all);
  }
}

export function setCurrentLayer(textId: string, layer: LayerId): void {
  const all = loadAllProgress();
  if (!all[textId]) {
    all[textId] = {
      textId,
      completedLayers: [],
      currentLayer: layer,
      lastReadAt: new Date().toISOString(),
      tokensViewed: [],
    };
  } else {
    all[textId].currentLayer = layer;
    all[textId].lastReadAt = new Date().toISOString();
  }
  saveAll(all);
}

export function completeLayer(textId: string, layer: LayerId): void {
  const all = loadAllProgress();
  if (!all[textId]) {
    all[textId] = {
      textId,
      completedLayers: [layer],
      currentLayer: layer,
      lastReadAt: new Date().toISOString(),
      tokensViewed: [],
    };
  } else if (!all[textId].completedLayers.includes(layer)) {
    all[textId].completedLayers.push(layer);
    all[textId].lastReadAt = new Date().toISOString();
  }
  saveAll(all);
}

export function initProgress(textId: string): ReadingProgress {
  const all = loadAllProgress();
  if (!all[textId]) {
    all[textId] = {
      textId,
      completedLayers: [],
      currentLayer: 1,
      lastReadAt: new Date().toISOString(),
      tokensViewed: [],
    };
    saveAll(all);
  }
  return all[textId];
}

/* ═══════════════════════════════════════════
   開閉カウンタ (VocabModal / トークンヒント)
   作品ごとに「単語解説」「トークンヒント」を何度開いたかを記録
   ═══════════════════════════════════════════ */

export interface OpenCounters {
  vocab: Record<string, Record<string, number>>; // textId → lemma → count
  hint: Record<string, Record<string, number>>; // textId → token → count
  lastOpenedAt?: string;
}

export function getOpenCounters(): OpenCounters {
  if (typeof window === "undefined") return { vocab: {}, hint: {} };
  try {
    const raw = localStorage.getItem(OPEN_COUNTER_KEY);
    if (!raw) return { vocab: {}, hint: {} };
    const parsed = JSON.parse(raw) as Partial<OpenCounters>;
    return {
      vocab: parsed.vocab || {},
      hint: parsed.hint || {},
      lastOpenedAt: parsed.lastOpenedAt,
    };
  } catch {
    return { vocab: {}, hint: {} };
  }
}

function saveOpenCounters(c: OpenCounters): void {
  try {
    localStorage.setItem(OPEN_COUNTER_KEY, JSON.stringify(c));
  } catch {
    // storage full
  }
}

export function recordVocabOpen(textId: string, lemma: string): void {
  if (!textId || !lemma) return;
  const c = getOpenCounters();
  if (!c.vocab[textId]) c.vocab[textId] = {};
  c.vocab[textId][lemma] = (c.vocab[textId][lemma] || 0) + 1;
  c.lastOpenedAt = new Date().toISOString();
  saveOpenCounters(c);
}

export function recordHintOpen(textId: string, token: string): void {
  if (!textId || !token) return;
  const c = getOpenCounters();
  if (!c.hint[textId]) c.hint[textId] = {};
  c.hint[textId][token] = (c.hint[textId][token] || 0) + 1;
  c.lastOpenedAt = new Date().toISOString();
  saveOpenCounters(c);
}
