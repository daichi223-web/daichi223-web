import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_GROUPS, groupsOfRun, readClearedGroups, recordClearedGroups, remainingGroups } from '../lib/readingClear';

function stubStorage() {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
}

describe('教材の先生を手に入れる条件＝全部の分類を8割以上（readingClear）', () => {
  beforeEach(() => { stubStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('分類を1つ解いただけでは、残りがある', () => {
    const avail = ['aux', 'joshi', 'vocab', 'read'];
    const done = recordClearedGroups('t1', groupsOfRun('aux', avail));
    expect(remainingGroups(avail, done)).toEqual(['joshi', 'vocab', 'read']);
  });

  it('分類ごとに別の回に解いても、全部そろえば残りなし', () => {
    const avail = ['grammar', 'vocab', 'read'];
    for (const g of avail) recordClearedGroups('t2', groupsOfRun(g, avail));
    expect(remainingGroups(avail, readClearedGroups('t2'))).toEqual([]);
  });

  it('「全部まとめて」の回は、その教材の分類が全部そろう', () => {
    const avail = ['aux', 'joshi', 'vocab', 'read'];
    const done = recordClearedGroups('t3', groupsOfRun(null, avail));
    expect(remainingGroups(avail, done)).toEqual([]);
  });

  it('分類の無い教材は、全部まとめてを1回で残りなし', () => {
    expect(remainingGroups([], [])).toEqual([ALL_GROUPS]);
    const done = recordClearedGroups('t4', groupsOfRun(null, []));
    expect(remainingGroups([], done)).toEqual([]);
  });

  it('教材ごとに別に覚える', () => {
    recordClearedGroups('a', ['vocab']);
    expect(readClearedGroups('b')).toEqual([]);
    expect(readClearedGroups('a')).toEqual(['vocab']);
  });
});
