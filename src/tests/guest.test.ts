import { describe, it, expect, beforeEach } from 'vitest';
import { captureGuestParam, clearGuest, guestVersion, isGuest, setGuest } from '../lib/guest';
import { hashGuestPassword, normalizeGuestPassword } from '../../api/_guestHash';

// テストは node で動くので、localStorage の代わりを置く
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> }).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};

// お試し（ゲスト）：パスワードで入った端末に版つきの印を付ける（2026-11-13 ユーザー指示「パスワード制」）
describe('guest（お試し）', () => {
  beforeEach(() => store.clear());

  it('?guest=1 は、まだゲストでなければパスワードの画面へ。ゲストなら移らない', () => {
    expect(captureGuestParam('?guest=1')).toBe('/guest');
    setGuest(3);
    expect(captureGuestParam('?guest=1')).toBeNull();
    expect(isGuest()).toBe(true);
    expect(guestVersion()).toBe(3);
  });

  it('?guest=0 で印が外れる。ほかのアドレスでは何もしない', () => {
    setGuest(1);
    expect(captureGuestParam('?mode=word')).toBeNull();
    expect(isGuest()).toBe(true);
    expect(captureGuestParam('?guest=0')).toBeNull();
    expect(isGuest()).toBe(false);
  });

  it('?guest=1 だけでは印は付かない（パスワードが要る）', () => {
    captureGuestParam('?guest=1');
    expect(isGuest()).toBe(false);
    clearGuest();
    expect(guestVersion()).toBeNull();
  });

  it('壊れた印はゲスト扱いにしない', () => {
    localStorage.setItem('kobun.guest', '1');
    expect(isGuest()).toBe(false);
  });
});

describe('お試しのパスワードの照合（api/_guestHash.ts）', () => {
  it('全角・前後の空白は正規化する', () => {
    expect(normalizeGuestPassword('ｇｕｅｓｔ１')).toBe('guest1');
    expect(normalizeGuestPassword(' guest1 ')).toBe('guest1');
    expect(normalizeGuestPassword(3)).toBe('');
  });

  it('同じ salt なら同じハッシュ、パスワードが違えば違うハッシュ', () => {
    const salt = '2a3c563c095e0d4e35d4300a389b3e99';
    expect(hashGuestPassword('guest1', salt)).toBe(hashGuestPassword(normalizeGuestPassword('ｇｕｅｓｔ１'), salt));
    expect(hashGuestPassword('guest1', salt)).not.toBe(hashGuestPassword('guest2', salt));
  });

  it('移行ファイルの最初のパスワードは guest1', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync(new URL('../../supabase/migrations/018_guest_access.sql', import.meta.url), 'utf8');
    const m = /values \(1, true, '([0-9a-f]{64})', '([0-9a-f]{32})'/.exec(sql);
    expect(m).not.toBeNull();
    expect(hashGuestPassword('guest1', m![2])).toBe(m![1]);
  });
});
