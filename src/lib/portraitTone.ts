import { useEffect, useState } from 'react';

export type PortraitTone = 'sharp' | 'yuru' | 'pop';

export const PORTRAIT_TONE_KEY = 'kobun.noble.portraitTone';
const CHANGE_EVENT = 'kobun:portrait-tone-change';

export function readPortraitTone(): PortraitTone {
  try {
    const value = localStorage.getItem(PORTRAIT_TONE_KEY);
    // 既定（まだ選んでいない端末）はゆるキャラ（2026-11-02 ユーザー指示）。選んだことがあればその値
    return value === 'sharp' || value === 'yuru' || value === 'pop' ? value : 'yuru';
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
      const custom = event as CustomEvent<PortraitTone>;
      setTone(custom.detail === 'sharp' || custom.detail === 'yuru' || custom.detail === 'pop' ? custom.detail : readPortraitTone());
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
