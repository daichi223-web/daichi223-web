import { describe, it, expect, beforeEach } from 'vitest';
import { captureGuestParam, isGuest } from '../lib/guest';

// テストは node で動くので、localStorage の代わりを置く
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> }).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};

// お試し（ゲスト）の入口：?guest=1 で端末に印が付き、?guest=0 で外れる（2026-11-13 ユーザー指示）
describe('guest（お試しのアドレス）', () => {
  beforeEach(() => localStorage.clear());

  it('?guest=1 で印が付き、?guest=0 で外れる。ほかのアドレスでは変わらない', () => {
    expect(isGuest()).toBe(false);
    captureGuestParam('?mode=word');
    expect(isGuest()).toBe(false);
    captureGuestParam('?guest=1');
    expect(isGuest()).toBe(true);
    captureGuestParam('');
    expect(isGuest()).toBe(true);
    captureGuestParam('?guest=0');
    expect(isGuest()).toBe(false);
  });

  it('1 と 0 以外の値では何もしない', () => {
    captureGuestParam('?guest=yes');
    expect(isGuest()).toBe(false);
  });
});
