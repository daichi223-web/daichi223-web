// お試し（ゲスト）用の入口（2026-11-13 ユーザー指示「試し用に、ゲストログインできるアドレスもほしい」
// →「やっぱりパスワード制にして。教員画面でパスワード設定できるように。分析用の記録だけ止める」）。
//
// https://kobun-tan-delta.vercel.app/?guest=1 → パスワードの画面（/guest）→ 合えばその端末は登録なしで使える。
// 登録必須（VITE_AUTH_REQUIRED=1）の間も、RequireAccount がゲストの端末を通す。
// パスワードは教員画面の「お試し」タブで設定・停止する（サーバ側 api/_guest.ts、表 guest_access）。
// 端末は入ったときのパスワードの版（version）を覚える。起動時に照合し、パスワードが変わった・止めたら印を外す。
// ゲストの間は分析用の記録（learning_events）を送らない（learningEvents.ts の logEvent）。
// 単語の成績・復習の予定（word_stats / srs_state）は残す（お試しでも今日の分や位階が動くように）。
// お試しの画面からは登録（/account）へつながない（2026-11-13 ユーザー指示）。ゲストをやめるには ?guest=0 を開く。

import { STORAGE_KEYS } from './storageKeys';

const KEY = STORAGE_KEYS.guest;

/** 端末に保存したゲストの印（入ったときのパスワードの版）。無ければ null */
export function guestVersion(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return null;
    const v = Number(JSON.parse(raw)?.v);
    return Number.isInteger(v) ? v : null;
  } catch {
    return null;
  }
}

export function isGuest(): boolean {
  return guestVersion() != null;
}

export function setGuest(version: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: version }));
  } catch {
    /* 保存できない端末はゲストにならない（登録画面へ） */
  }
}

export function clearGuest(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/**
 * 起動時にアドレスを見る。?guest=0 は印を外す。?guest=1 で、まだゲストでなければパスワードの画面（/guest）へ。
 * 戻り値は移り先のパス（移らないなら null）。
 */
export function captureGuestParam(search: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
  const v = new URLSearchParams(search).get('guest');
  if (v === '0') {
    clearGuest();
    return null;
  }
  if (v === '1' && !isGuest()) return '/guest';
  return null;
}

/** パスワードを照合する。合えば印を付けて true */
export async function loginGuest(password: string): Promise<{ ok: true } | { ok: false; reason: 'wrong' | 'disabled' | 'network' }> {
  try {
    const r = await fetch('/api/teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'guestLogin', password }),
    });
    if (r.status === 401) return { ok: false, reason: 'wrong' };
    if (r.status === 403) return { ok: false, reason: 'disabled' };
    if (!r.ok) return { ok: false, reason: 'network' };
    const data = (await r.json()) as { version?: unknown };
    const ver = Number(data.version);
    if (!Number.isInteger(ver)) return { ok: false, reason: 'network' };
    setGuest(ver);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

let checked: Promise<boolean> | null = null;

/**
 * ゲストの印がまだ有効か（パスワードが変わっていない・止めていない）をサーバに聞く。ページを開いている間は1回だけ。
 * 無効なら印を外して false。通信に失敗したときは止めずに true（学習を止めない）。
 */
export function verifyGuest(): Promise<boolean> {
  const v = guestVersion();
  if (v == null) return Promise.resolve(false);
  if (!checked) {
    checked = (async () => {
      try {
        const r = await fetch(`/api/teacher?action=guestCheck&v=${v}`, { cache: 'no-store' });
        if (!r.ok) return true;
        const data = (await r.json()) as { ok?: unknown };
        if (data.ok === true) return true;
        clearGuest();
        return false;
      } catch {
        return true;
      }
    })();
  }
  return checked;
}
