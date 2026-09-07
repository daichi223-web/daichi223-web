import { useEffect, useState } from 'react';

export type PortraitTone = 'sharp' | 'yuru' | 'pop';

export const PORTRAIT_TONE_KEY = 'kobun.noble.portraitTone';
const CHANGE_EVENT = 'kobun:portrait-tone-change';

export function readPortraitTone(): PortraitTone {
  try {
    const value = localStorage.getItem(PORTRAIT_TONE_KEY);
    return value === 'yuru' || value === 'pop' ? value : 'sharp';
  } catch {
    return 'sharp';
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
      setTone(custom.detail === 'yuru' || custom.detail === 'pop' ? custom.detail : readPortraitTone());
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
