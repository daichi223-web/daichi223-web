import { describe, it, expect } from 'vitest';
import { findInflectedSpan, resolveTargetSpans, splitBySpans, NO_MATCH_QIDS, type Span } from '../lib/targetMark';
import type { Word } from '../types';
import slimJson from '../data/kobunQ.v2.slim.json';

// 実データ（kobunQ.v2.slim）。mark は scripts/build-kobunq-slim.py が jpBlank との差分から生成する。
type SlimWord = Pick<Word, 'qid' | 'lemma' | 'pos' | 'examples'>;
const slim = slimJson as unknown as SlimWord[];
const byQid = (qid: string): SlimWord => {
  const w = slim.find((x) => x.qid === qid);
  if (!w) throw new Error(`qid ${qid} が slim に無い`);
  return w;
};
const cut = (text: string, spans: Span[]) => spans.map(([s, n]) => text.slice(s, s + n));

describe('splitBySpans', () => {
  it('範囲が無ければ全文を1つで返す', () => {
    expect(splitBySpans('夢なりけり', [])).toEqual([{ text: '夢なりけり', marked: false }]);
  });

  it('先頭・末尾の範囲', () => {
    expect(splitBySpans('おどろきて見れば', [[0, 4]])).toEqual([
      { text: 'おどろき', marked: true },
      { text: 'て見れば', marked: false },
    ]);
    expect(splitBySpans('山見ゆ', [[1, 2]])).toEqual([
      { text: '山', marked: false },
      { text: '見ゆ', marked: true },
    ]);
  });

  it('複数範囲は全部に印を付ける（順不同でも昇順に直す）', () => {
    expect(splitBySpans('えあはず。', [[3, 1], [0, 1]])).toEqual([
      { text: 'え', marked: true },
      { text: 'あは', marked: false },
      { text: 'ず', marked: true },
      { text: '。', marked: false },
    ]);
  });

  it('範囲外・重なり・長さ0は捨てる', () => {
    expect(splitBySpans('あいうえお', [[1, 2], [2, 2], [4, 5], [-1, 2], [3, 0]])).toEqual([
      { text: 'あ', marked: false },
      { text: 'いう', marked: true },
      { text: 'えお', marked: false },
    ]);
  });
});

describe('findInflectedSpan', () => {
  it('動詞は語幹＋同じ行の1字。ウ段＋「る／れ」は含める', () => {
    expect(cut('おどろきて涙をおとす（源氏物語）', [findInflectedSpan('おどろきて涙をおとす（源氏物語）', 'おどろく', '動詞')!])).toEqual(['おどろき']);
    expect(cut('めでたうおぼゆるに（源氏物語）', [findInflectedSpan('めでたうおぼゆるに（源氏物語）', 'おぼゆ', '動詞')!])).toEqual(['おぼゆる']);
    expect(cut('いたはしうこそおぼゆれ', [findInflectedSpan('いたはしうこそおぼゆれ', 'おぼゆ', '動詞')!])).toEqual(['おぼゆれ']);
  });

  it('形容詞はシク活用の語尾まで伸ばす。形容動詞は語幹＋語尾', () => {
    const a = '野分のまたの日こそ、いみじうあはれにをかしけれ（枕草子）';
    expect(cut(a, [findInflectedSpan(a, 'をかし', '形容詞')!])).toEqual(['をかしけれ']);
    expect(cut(a, [findInflectedSpan(a, 'いみじ', '形容詞')!])).toEqual(['いみじう']);
    expect(cut('散ればこそいとど桜はめでたけれ', [findInflectedSpan('散ればこそいとど桜はめでたけれ', 'めでたし', '形容詞')!])).toEqual(['めでたけれ']);
    expect(cut('おろかに思さるるにやあらむ', [findInflectedSpan('おろかに思さるるにやあらむ', 'おろかなり', '形容動詞')!])).toEqual(['おろかに']);
  });

  it('併記と「～」入りの見出し語は分解して試す', () => {
    expect(cut('などかくは仰せらるる。', [findInflectedSpan('などかくは仰せらるる。', 'など・などか', '副詞')!])).toEqual(['などか']);
    expect(cut('人目しげければ、えあはず。', [findInflectedSpan('人目しげければ、えあはず。', 'え～打消', '副詞')!])).toEqual(['え']);
    expect(cut('言忌みもしあへず。', [findInflectedSpan('言忌みもしあへず。', '～あへず', '連体詞・連語')!])).toEqual(['あへず']);
  });

  it('語幹が1文字以下の語は活用照合をしない（完全一致は可）', () => {
    expect(findInflectedSpan('よき人はあやしきことを語らず。', 'よし', '形容詞')).toBeNull();
    expect(findInflectedSpan('男、縁にのぼりてゐぬ。', 'ゐる', '動詞')).toBeNull();
    expect(findInflectedSpan('尼になる（源氏物語）', 'なる', '動詞')).toEqual([2, 2]);
  });

  it('名詞・副詞は完全一致のみ。末尾の出典括弧の中には当てない', () => {
    expect(findInflectedSpan('つひに本意のごとくあひにけり。', 'ほい', '名詞')).toBeNull();
    expect(findInflectedSpan('昔、男ありけり（伊勢物語）', 'ものがたり', '名詞')).toBeNull();
    expect(findInflectedSpan('昔の人のこと（伊勢ものがたり）', 'ものがたり', '名詞')).toBeNull();
  });
});

describe('resolveTargetSpans', () => {
  it('データの位置を優先する（活用した形のまま）', () => {
    const w = byQid('1-1');
    const jp = w.examples[0].jp;
    expect(jp).toBe('秋来ぬと目にはさやかに見えねども風の音にぞおどろかれぬる（古今和歌集）');
    const r = resolveTargetSpans(jp, w);
    expect(r.source).toBe('data');
    expect(r.spans).toEqual([[21, 4]]);
    expect(cut(jp, r.spans)).toEqual(['おどろか']);
  });

  it('呼応の語は2つの範囲を返す', () => {
    const w = byQid('47-1');
    const jp = w.examples[1].jp;
    expect(jp).toBe('人目しげければ、えあはず。（伊勢物語）');
    const r = resolveTargetSpans(jp, w);
    expect(r.source).toBe('data');
    expect(cut(jp, r.spans)).toEqual(['え', 'ず']);
  });

  it('データに無い例文は活用照合で決める', () => {
    const jp = 'おどろきて見れば、夢なりけり（更級日記）';
    const r = resolveTargetSpans(jp, byQid('1-1'));
    expect(r).toEqual({ spans: [[0, 4]], source: 'match' });
  });

  it('どちらも無ければ印なし', () => {
    expect(resolveTargetSpans('海の中にはつかに山見ゆ（竹取物語）', byQid('7-1'))).toEqual({ spans: [], source: 'none' });
    expect(resolveTargetSpans('', byQid('1-1'))).toEqual({ spans: [], source: 'none' });
  });

  it('除外表の語は照合での印を付けない（データの位置は使う）', () => {
    const w = byQid('48-1');
    expect(NO_MATCH_QIDS.has('48-1')).toBe(true);
    expect(resolveTargetSpans('身も亡びなむ、かくなせそ（伊勢物語）', w).source).toBe('none');
    const jp = w.examples[0].jp;
    expect(resolveTargetSpans(jp, w).source).toBe('data');
  });
});

// 全件の回帰検査: データの位置（単一範囲）を正解として、活用照合が「別の場所」を指さないことを固定する。
// 2026-10-05 の実測（1,246 件）: 一致 869 / 短い 70 / 長い 1 / 内側 13 / 見つからない 291 / 別の場所 2
describe('findInflectedSpan: 全件の回帰検査', () => {
  // 正解の範囲と交わらない位置を返す既知の件
  //   211-1 さかし   …「さかしうて、まことにさかしき人」の手前の「さかしう」に当たる
  //   297-2 ことなり …「まことにこと人」の「ことに」に当たる
  const KNOWN_ELSEWHERE = ['211-1', '297-2'];

  it('正解と交わらない位置を返すのは既知の件だけ', () => {
    const count = { same: 0, overlap: 0, none: 0, elsewhere: 0 };
    const elsewhere: string[] = [];
    let total = 0;
    for (const w of slim) {
      for (const e of w.examples) {
        if (!e.mark || e.mark.length !== 1) continue;
        total++;
        const [ts, tl] = e.mark[0];
        const found = findInflectedSpan(e.jp, w.lemma, w.pos);
        if (!found) {
          count.none++;
        } else if (found[0] === ts && found[1] === tl) {
          count.same++;
        } else if (found[0] + found[1] <= ts || found[0] >= ts + tl) {
          count.elsewhere++;
          elsewhere.push(w.qid);
        } else {
          count.overlap++;
        }
      }
    }
    expect(elsewhere).toEqual(KNOWN_ELSEWHERE);
    expect(total).toBe(1246);
    expect(count.same + count.overlap + count.none + count.elsewhere).toBe(total);
    // 照合が正解と同じ範囲になる割合が落ちていないこと
    expect(count.same).toBeGreaterThanOrEqual(869);
  });

  it('データの位置はすべて例文の内側にあり、重ならない', () => {
    for (const w of slim) {
      for (const e of w.examples) {
        if (!e.mark) continue;
        const parts = splitBySpans(e.jp, e.mark);
        expect(parts.filter((p) => p.marked).length).toBe(e.mark.length);
        expect(parts.map((p) => p.text).join('')).toBe(e.jp);
      }
    }
  });
});
