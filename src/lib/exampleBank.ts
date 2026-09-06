/**
 * 用例バンク（public/example-bank/<lemma>.json）の読み込み。
 *
 * 1語あたり数十例。kobunQ の2例だけでなく、教材本文・辞書・コーパス由来の用例を
 * 意味ごとに並べるために使う。本文由来（origin='text'）は textId を持つので、
 * 公開されている教材なら本文へ飛べる。
 *
 * 語ごとに遅延読み込みし、一度読んだらメモリに置く（1ファイル数KB）。
 */

export type BankExample = {
  jp: string;
  translation?: string;
  source?: string;
  origin?: 'kobunq' | 'text' | 'dict' | 'corpus' | string;
  senseId?: string;
  textId?: string;
  sentenceId?: string;
  tokenId?: string;
};

export type ExampleBank = {
  lemma: string;
  senses?: Array<{ qid: string; sense: string }>;
  examples: BankExample[];
};

const cache = new Map<string, ExampleBank | null>();
const inflight = new Map<string, Promise<ExampleBank | null>>();

export async function loadExampleBank(lemma: string): Promise<ExampleBank | null> {
  if (cache.has(lemma)) return cache.get(lemma) ?? null;
  const running = inflight.get(lemma);
  if (running) return running;

  const p = (async () => {
    try {
      const res = await fetch(`/example-bank/${encodeURIComponent(lemma)}.json`);
      if (!res.ok) {
        cache.set(lemma, null);
        return null;
      }
      const data = (await res.json()) as ExampleBank;
      const value = data && Array.isArray(data.examples) ? data : null;
      cache.set(lemma, value);
      return value;
    } catch {
      cache.set(lemma, null);
      return null;
    } finally {
      inflight.delete(lemma);
    }
  })();
  inflight.set(lemma, p);
  return p;
}

/** 意味（qid）ごとに用例をまとめる。senseId の無い例は '' に入る */
export function groupBySense(bank: ExampleBank | null): Record<string, BankExample[]> {
  const out: Record<string, BankExample[]> = {};
  if (!bank) return out;
  for (const ex of bank.examples) {
    const k = ex.senseId ?? '';
    (out[k] ||= []).push(ex);
  }
  return out;
}

/** 同じ本文・同じ文の重複を落とし、本文由来を先に並べる */
export function dedupeExamples(list: BankExample[]): BankExample[] {
  const seen = new Set<string>();
  const out: BankExample[] = [];
  const rank = (e: BankExample) => (e.origin === 'text' ? 0 : e.origin === 'kobunq' ? 1 : 2);
  for (const ex of [...list].sort((a, b) => rank(a) - rank(b))) {
    const key = (ex.jp || '').replace(/\s+/g, '').replace(/[【】〔〕]/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ex);
  }
  return out;
}
