import { describe, it, expect } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PORTRAIT_FACES, STAGE_COUNT, faceThumbSrc } from '../lib/portraitFaces';

const TONES = ['sharp', 'yuru', 'pop', 'miyabi'] as const;
const PUB = resolve(__dirname, '../../public');

describe('顔だけの小さい画像（public/portraits/face）', () => {
  it('4画風 × 21階ぶんが全部そろっていて、小さい（20KB 以下）', () => {
    for (const tone of TONES) {
      for (let n = 1; n <= STAGE_COUNT; n++) {
        const src = faceThumbSrc(tone, n);
        expect(src, `${tone} ${n}`).not.toBeNull();
        const file = resolve(PUB, '.' + src!);
        expect(existsSync(file), `${tone} 第${n}階 ${src}`).toBe(true);
        expect(statSync(file).size, src!).toBeLessThan(20 * 1024);
      }
    }
    expect(PORTRAIT_FACES.sharp).toHaveLength(STAGE_COUNT);
  });

  it('webp の 128x128（RIFF/WEBP ヘッダで確認）', () => {
    const buf = readFileSync(resolve(PUB, 'portraits/face/sharp-01.webp'));
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
  });

  it('範囲外の階は null（呼ぶ側が大きい肖像に戻す）', () => {
    expect(faceThumbSrc('sharp', 0)).toBeNull();
    expect(faceThumbSrc('sharp', 22)).toBeNull();
    expect(faceThumbSrc('sharp', 2.5)).toBeNull();
  });
});
