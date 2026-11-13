import { useEffect, useState } from 'react';

// 絵の雰囲気（テーマ画面の「あなたのキャラ」）。自分の肖像と、答え合わせの先生の絵の両方に効く。
// 値（sharp / yuru / pop / miyabi）は端末に保存しているので変えない。画面の名前は PORTRAIT_TONE_LABEL。
// 2026-11-13 ユーザー指示「みやびを、あなたのキャラのところに入れたい。ほかのキャラの雰囲気の名前も考え直して」：
//   miyabi を足し、名前を ゆるキャラ×史実→ゆるり、ポップ学習キャラ→いろどり、キリッと青年→しっとり に。
//   先生の絵だけ別に選んでいた設定（旧 lib/teacherArt.ts「肖像と同じ／みやび」）はこれに一本化した。
export type PortraitTone = 'sharp' | 'yuru' | 'pop' | 'miyabi';

/** 画面に並べる順と名前 */
export const PORTRAIT_TONES: readonly PortraitTone[] = ['yuru', 'pop', 'sharp', 'miyabi'];

export const PORTRAIT_TONE_LABEL: Record<PortraitTone, string> = {
  yuru: 'ゆるり',     // 二頭身のゆるい水彩
  pop: 'いろどり',    // 色あざやかなポップ
  sharp: 'しっとり',  // 淡い水彩の全身像
  miyabi: 'みやび',   // すっきりした線の絵（先生の絵は Codex 作）
};

export function isPortraitTone(v: unknown): v is PortraitTone {
  return v === 'sharp' || v === 'yuru' || v === 'pop' || v === 'miyabi';
}

export const PORTRAIT_TONE_KEY = 'kobun.noble.portraitTone';
const CHANGE_EVENT = 'kobun:portrait-tone-change';

export function readPortraitTone(): PortraitTone {
  try {
    const value = localStorage.getItem(PORTRAIT_TONE_KEY);
    // 既定（まだ選んでいない端末）はゆるり（2026-11-02 ユーザー指示）。選んだことがあればその値
    return isPortraitTone(value) ? value : 'yuru';
  } catch {
    return 'yuru';
  }
}

export function writePortraitTone(tone: PortraitTone): void {
  try {
    localStorage.setItem(PORTRAIT_TONE_KEY, tone);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: tone }));
  } catch {
    /* noop */
  }
}

export function usePortraitTone(): [PortraitTone, (tone: PortraitTone) => void] {
  const [tone, setTone] = useState<PortraitTone>(readPortraitTone);

  useEffect(() => {
    const sync = (event: Event) => {
      const custom = event as CustomEvent<unknown>;
      setTone(isPortraitTone(custom.detail) ? custom.detail : readPortraitTone());
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return [tone, writePortraitTone];
}
