import { useEffect, useState } from "react";
import { fetchJsonAsset } from "@/lib/fetchJson";

/**
 * 接頭語・接尾語・動詞の下に付く語の一覧（public/affixes.json）。
 * 配布プリント（teaching/補助プリント/接頭語・接尾語）と同じデータを正本として共有する。
 * 教材トークンの affixRefs はこの entry.key を指す。
 */
export interface AffixMeaning {
  meaning: string;
  example: string;
}

export interface AffixEntry {
  key: string;
  word: string;
  stars: number;
  means: AffixMeaning[];
  point: string;
}

export interface AffixSection {
  id: string;
  title: string;
  subtitle: string;
  lead: string;
  entries: AffixEntry[];
}

export interface AffixDoc {
  title: string;
  note: string;
  sections: AffixSection[];
}

export interface AffixLookup {
  entry: AffixEntry;
  section: AffixSection;
}

let cache: Promise<AffixDoc | null> | null = null;

export function loadAffixes(): Promise<AffixDoc | null> {
  if (!cache) {
    cache = fetchJsonAsset<AffixDoc>("/affixes.json").then((r) => {
      if (r.ok) return r.data;
      cache = null; // 失敗は次回やり直す
      return null;
    });
  }
  return cache;
}

export function indexAffixes(doc: AffixDoc): Map<string, AffixLookup> {
  const map = new Map<string, AffixLookup>();
  for (const section of doc.sections) {
    for (const entry of section.entries) map.set(entry.key, { entry, section });
  }
  return map;
}

/** 一覧を読み込む。enabled が false なら読み込まない（ポップオーバーで無駄な fetch をしないため） */
export function useAffixes(enabled = true): AffixDoc | null | undefined {
  const [doc, setDoc] = useState<AffixDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadAffixes().then((d) => {
      if (!cancelled) setDoc(d);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return doc;
}
