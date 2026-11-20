import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import bundledTextsV3 from '../data/textsV3Index.json';
import { ALL_GROUPS } from '../lib/readingClear';
import {
  EARLIER, ESTATE_PARTS, nextPart, plantFor, plantImage, plantStage, readGardenRuns, recordGardenRun, restoredParts, seasonOf, workName,
  type PlantKey, type Stage,
} from '../lib/garden';

function stubStorage() {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
}

const G3 = ['aux', 'vocab', 'read'];

describe('草木の段（plantStage）', () => {
  it('種 → 芽 → 若葉 → つぼみ → 花 → 満開', () => {
    expect(plantStage(false, [])).toBe(0);
    expect(plantStage(true, [])).toBe(1);
    expect(plantStage(false, [], { groups: G3 })).toBe(1); // テストを解いた（8割に届かなくても）
    expect(plantStage(true, ['aux'], { groups: G3 })).toBe(2);
    expect(plantStage(true, ['aux', 'vocab'], { groups: G3 })).toBe(3);
    expect(plantStage(true, G3, { groups: G3, bloomDay: '2026-11-21' })).toBe(4);
    expect(plantStage(true, G3, { groups: G3, bloomDay: '2026-11-21', fullDay: '2026-11-24' })).toBe(5);
  });
  it('分類が2つなら、1つでつぼみ', () => {
    expect(plantStage(true, ['aux'], { groups: ['aux', 'read'] })).toBe(3);
  });
  it('分類の無い教材は「全部まとめて」の印で花', () => {
    expect(plantStage(true, [ALL_GROUPS], { groups: [] })).toBe(4);
  });
  it('分類の一覧が無い古い記録：「全部まとめて」の印なら花、ほかは若葉', () => {
    expect(plantStage(true, [ALL_GROUPS])).toBe(4);
    expect(plantStage(true, ['aux', 'vocab', 'read'])).toBe(2);
  });
});

describe('読解テストの回の記録（recordGardenRun）', () => {
  beforeEach(() => { stubStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const run = (before: string[], after: string[], fullRun: boolean, passed: boolean, day: string) =>
    recordGardenRun('t1', { groups: G3, clearedBefore: before, clearedAfter: after, fullRun, passed }, day);

  it('全部の分類がそろった日を花の日にする', () => {
    run([], ['aux'], false, true, '2026-11-20');
    expect(readGardenRuns().t1.bloomDay).toBeUndefined();
    run(['aux'], ['aux', 'vocab', 'read'], true, true, '2026-11-21');
    expect(readGardenRuns().t1).toEqual({ groups: G3, bloomDay: '2026-11-21' });
  });
  it('満開は、花の日と別の日に「全部まとめて」で8割以上', () => {
    run([], G3, true, true, '2026-11-21');
    run(G3, G3, true, true, '2026-11-21'); // 同じ日はまだ
    expect(readGardenRuns().t1.fullDay).toBeUndefined();
    run(G3, G3, false, true, '2026-11-22'); // 分類を選んだ回はまだ
    expect(readGardenRuns().t1.fullDay).toBeUndefined();
    run(G3, G3, true, false, '2026-11-22'); // 8割に届かない回はまだ
    expect(readGardenRuns().t1.fullDay).toBeUndefined();
    run(G3, G3, true, true, '2026-11-23');
    expect(readGardenRuns().t1.fullDay).toBe('2026-11-23');
    expect(plantStage(true, G3, readGardenRuns().t1)).toBe(5);
  });
  it('この機能より前にそろっていた教材は、咲いた日を「前」として、次の「全部まとめて」で満開', () => {
    const rec = run(G3, G3, true, true, '2026-11-21');
    expect(rec.bloomDay).toBe(EARLIER);
    expect(rec.fullDay).toBe('2026-11-21');
  });
  it('8割に届かない回でも、分類の一覧を覚えて芽を出す', () => {
    const rec = run([], [], true, false, '2026-11-21');
    expect(rec).toEqual({ groups: G3 });
    expect(plantStage(false, [], rec)).toBe(1);
  });
});

describe('院のよみがえる順（restoredParts）', () => {
  it('結びつきの無い教材は、決まった順に直す（寝殿 → 西の対 → 東の対 …）', () => {
    const r = restoredParts([{ textId: 'x1', day: '2026-11-01' }, { textId: 'x2', day: '2026-11-02' }, { textId: 'x3', day: '2026-11-03' }]);
    expect(r.map((x) => x.key)).toEqual(['shinden', 'nishi', 'higashi']);
  });
  it('咲いた教材に結びつく所がまだ荒れていれば、そこが先', () => {
    // 養和の飢饉（築地）→ 月やあらぬ（西の対）→ 結びつき無し（寝殿）
    const r = restoredParts([
      { textId: '946616b6f3', day: '2026-11-01' },
      { textId: 'f84b5ac5c5', day: '2026-11-02' },
      { textId: 'x', day: '2026-11-03' },
    ]);
    expect(r).toEqual([
      { key: 'tsuiji', by: '946616b6f3' },
      { key: 'nishi', by: 'f84b5ac5c5' },
      { key: 'shinden', by: 'x' },
    ]);
    expect(nextPart(r)?.key).toBe('higashi');
  });
  it('結びつく所がもう直っていれば、順で次の所', () => {
    // 野分のまたの日こそ は寝殿と前栽。寝殿が先に直っていれば前栽
    const r = restoredParts([{ textId: 'x', day: '2026-11-01' }, { textId: '1811f6888e', day: '2026-11-02' }]);
    expect(r.map((x) => x.key)).toEqual(['shinden', 'senzai']);
  });
  it('咲いた日の順に見る（日付が無い＝前の記録が先）。11か所より多く咲いても11か所', () => {
    const blooms = Array.from({ length: 14 }, (_, i) => ({ textId: `t${String(i).padStart(2, '0')}`, day: `2026-11-${String(10 + i)}` }));
    blooms.push({ textId: 'f84b5ac5c5', day: EARLIER });
    const r = restoredParts(blooms);
    expect(r[0]).toEqual({ key: 'nishi', by: 'f84b5ac5c5' });
    expect(r).toHaveLength(ESTATE_PARTS.length);
    expect(new Set(r.map((x) => x.key)).size).toBe(ESTATE_PARTS.length);
    expect(nextPart(r)).toBeNull();
  });
  it('院に結びつけた教材 ID はすべて教材の一覧にある', () => {
    const ids = new Set((bundledTextsV3 as { id: string }[]).map((t) => t.id));
    for (const p of ESTATE_PARTS) for (const id of p.texts) expect(ids.has(id), `${p.key} ${id}`).toBe(true);
  });
});

describe('草木の種類と絵', () => {
  it('作品名で分け、無ければジャンルで分ける', () => {
    expect(plantFor('伊勢物語', '物語')).toBe('kobai');
    expect(plantFor('平家物語', '物語')).toBe('momiji');
    expect(plantFor('大鏡（二）', '物語')).toBe('fuji');
    expect(plantFor('［蕪村］', '物語')).toBe('yamabuki');
    expect(plantFor('源氏物語（一）', '物語')).toBe('sakura');
    expect(plantFor('枕草子（一）', '随筆')).toBe('hagi');
    expect(plantFor('更級日記', '日記')).toBe('ominaeshi');
    expect(plantFor('宇治拾遺物語', '説話')).toBe('fuji');
    expect(plantFor('', '和歌・韻文')).toBe('kobai');
    expect(workName('枕草子（二）')).toBe('枕草子');
  });
  it('段1〜5の絵がそろっている（段0は絵なし）', () => {
    const keys: PlantKey[] = ['sakura', 'kobai', 'momiji', 'fuji', 'hagi', 'ominaeshi', 'yamabuki'];
    for (const k of keys) {
      expect(plantImage(k, 0)).toBeNull();
      for (const s of [1, 2, 3, 4, 5] as Stage[]) {
        const src = plantImage(k, s)!;
        expect(existsSync(join(__dirname, '..', '..', 'public', src)), src).toBe(true);
      }
    }
  });
  it('季節', () => {
    expect(seasonOf(new Date(2026, 3, 1))).toBe('spring');
    expect(seasonOf(new Date(2026, 6, 1))).toBe('summer');
    expect(seasonOf(new Date(2026, 10, 21))).toBe('autumn');
    expect(seasonOf(new Date(2026, 0, 5))).toBe('winter');
  });
});
