import { describe, it, expect } from 'vitest';
import { PORTRAIT_FACES, STAGE_COUNT, faceFor, faceImgStyle } from '../lib/portraitFaces';
import { readMyStage } from '../lib/myStage';
import { STAGES } from '../lib/nobleData';

const TONES = ['sharp', 'yuru', 'pop', 'miyabi'] as const;

describe('PORTRAIT_FACES（肖像の顔の位置の表）', () => {
  it('4画風 × 21階（index = n-1）がそろっている（みやびは 2026-11-13 に追加）', () => {
    expect(STAGE_COUNT).toBe(STAGES.length);
    expect(Object.keys(PORTRAIT_FACES).sort()).toEqual([...TONES].sort());
    for (const tone of TONES) expect(PORTRAIT_FACES[tone]).toHaveLength(STAGE_COUNT);
  });

  it('cx・cy は 0〜100 の %、d は 0 より大きく 100 以下', () => {
    for (const tone of TONES) {
      PORTRAIT_FACES[tone].forEach((f, i) => {
        const where = `${tone} 第${i + 1}階`;
        expect(f.cx, where).toBeGreaterThanOrEqual(0);
        expect(f.cx, where).toBeLessThanOrEqual(100);
        expect(f.cy, where).toBeGreaterThanOrEqual(0);
        expect(f.cy, where).toBeLessThanOrEqual(100);
        expect(f.d, where).toBeGreaterThan(0);
        expect(f.d, where).toBeLessThanOrEqual(100);
      });
    }
  });

  it('faceFor は第 n 階 → index n-1、範囲外は index 0', () => {
    expect(faceFor('sharp', 1)).toBe(PORTRAIT_FACES.sharp[0]);
    expect(faceFor('yuru', 21)).toBe(PORTRAIT_FACES.yuru[20]);
    expect(faceFor('pop', 8)).toBe(PORTRAIT_FACES.pop[7]);
    expect(faceFor('pop', 0)).toBe(PORTRAIT_FACES.pop[0]);
    expect(faceFor('pop', 22)).toBe(PORTRAIT_FACES.pop[0]);
    expect(faceFor('pop', -3)).toBe(PORTRAIT_FACES.pop[0]);
    expect(faceFor('pop', Number.NaN)).toBe(PORTRAIT_FACES.pop[0]);
    expect(faceFor('pop', 2.5)).toBe(PORTRAIT_FACES.pop[0]);
  });
});

describe('faceImgStyle（丸い枠に顔の中心を合わせる計算）', () => {
  const num = (v: unknown): number => {
    expect(typeof v).toBe('number');
    return v as number;
  };

  it('顔の中心 (cx, cy) が横は枠の中心・縦は上から 6 割に来て、頭の直径が枠の 74%（既定）になる', () => {
    const face = { cx: 50, cy: 16, d: 13 };
    const box = 36;
    const s = faceImgStyle(face, box);
    const W = num(s.width);
    const H = num(s.height);
    expect(s.position).toBe('absolute');
    expect(s.maxWidth).toBe('none');
    expect(H).toBeCloseTo(W / (4 / 3), 6);                // 肖像は 4:3
    expect((W * face.d) / 100).toBeCloseTo(box * 0.74, 6); // 頭の直径 = 枠 × fill
    expect(num(s.left) + (W * face.cx) / 100).toBeCloseTo(box / 2, 6);
    expect(num(s.top) + (H * face.cy) / 100).toBeCloseTo(box * 0.6, 6); // 鼻は枠の上から 60%（冠が欠けないように）
  });

  it('aspect・fill・noseAt を指定できる', () => {
    const face = { cx: 45, cy: 40, d: 30 };
    const box = 40;
    const s = faceImgStyle(face, box, { aspect: 1, fill: 1, noseAt: 0.5 });
    const W = num(s.width);
    const H = num(s.height);
    expect(W).toBeCloseTo((box * 100) / face.d, 6);
    expect(H).toBeCloseTo(W, 6);
    expect(num(s.left) + (W * face.cx) / 100).toBeCloseTo(box / 2, 6);
    expect(num(s.top) + (H * face.cy) / 100).toBeCloseTo(box / 2, 6);
  });

  it('画風の仮の既定値でも、顔は枠より大きく拡大される（上寄せ・拡大の向き）', () => {
    for (const tone of TONES) {
      const s = faceImgStyle(faceFor(tone, 1), 36);
      expect(num(s.width)).toBeGreaterThan(36);
      expect(num(s.top)).toBeLessThan(0); // 顔は画像の上半分にあるので、画像の上端は枠の上より上
    }
  });

  it('d が 0 以下でも Infinity にならない', () => {
    const s = faceImgStyle({ cx: 50, cy: 50, d: 0 }, 36);
    expect(Number.isFinite(num(s.width))).toBe(true);
  });
});

describe('readMyStage（今の位階。通信なし）', () => {
  it('window の無い環境では第1階（無位・雑任）', () => {
    expect(readMyStage()).toEqual({ n: 1, rank: '無位', post: '雑任' });
  });
});
