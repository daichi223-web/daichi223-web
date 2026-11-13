// お試し（ゲスト）用の入口（2026-11-13 ユーザー指示「試し用に、ゲストログインできるアドレスもほしい」）。
//
// https://kobun-tan-delta.vercel.app/?guest=1 を開くと、その端末（ブラウザ）は登録なしで使える。
// 登録必須（VITE_AUTH_REQUIRED=1）の間も、RequireAccount がこの端末を通す。
// 中身はふつうの匿名セッション（ensureAnonSession）で、学習の記録は本番と同じ表に残る。
// 利用状況の集計は登録済みの生徒だけを数えるので、ゲストの記録は集計に混ざらない。
// アドレスを知っていれば誰でも入れる（ユーザー判断で合言葉なし）。生徒が登録を飛ばすこともできる。
// ゲストをやめるには /account で登録する（登録すると通常の扱い）か、?guest=0 を開く。

import { STORAGE_KEYS } from './storageKeys';

const KEY = STORAGE_KEYS.guest;

export function isGuest(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** アドレスの ?guest=1 / ?guest=0 を読んで、端末のゲストの印を付け外しする。起動時に1回呼ぶ */
export function captureGuestParam(search: string = typeof window !== 'undefined' ? window.location.search : ''): void {
  const v = new URLSearchParams(search).get('guest');
  if (v == null) return;
  try {
    if (v === '1') localStorage.setItem(KEY, '1');
    else if (v === '0') localStorage.removeItem(KEY);
  } catch {
    /* 保存できない端末はゲストにならない（登録画面へ） */
  }
}
