/**
 * adminSession ヘルパーの smoke テスト。
 * cookie / localStorage 両経路での判定ロジックを回帰保護する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hasAdminSession } from "../lib/adminSession";

function setCookie(cookie: string) {
  // jsdom なしでも動くように document/localStorage を簡易スタブ
  const g = globalThis as unknown as {
    document?: { cookie: string };
    localStorage?: { _m: Map<string, string>; getItem(k: string): string | null };
  };
  if (!g.document) g.document = { cookie: "" };
  g.document.cookie = cookie;
}

function setLocalStorage(value: string | null) {
  const g = globalThis as unknown as {
    localStorage?: {
      _m: Map<string, string>;
      getItem(k: string): string | null;
      setItem(k: string, v: string): void;
      removeItem(k: string): void;
    };
  };
  if (!g.localStorage) {
    const m = new Map<string, string>();
    g.localStorage = {
      _m: m,
      getItem: (k) => (m.has(k) ? m.get(k)! : null),
      setItem: (k, v) => {
        m.set(k, v);
      },
      removeItem: (k) => {
        m.delete(k);
      },
    };
  }
  if (value === null) g.localStorage.removeItem("ADMIN_VIEW_TOKEN");
  else g.localStorage.setItem("ADMIN_VIEW_TOKEN", value);
}

describe("hasAdminSession", () => {
  beforeEach(() => {
    setCookie("");
    setLocalStorage(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cookie / localStorage 共に空なら false", () => {
    expect(hasAdminSession()).toBe(false);
  });

  it("admin_csrf cookie があれば true（cookie 経路）", () => {
    setCookie("admin_csrf=abc123; path=/");
    expect(hasAdminSession()).toBe(true);
  });

  it("localStorage ADMIN_VIEW_TOKEN があれば true（レガシー経路）", () => {
    setLocalStorage("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(hasAdminSession()).toBe(true);
  });

  it("他の cookie 名（例: admin_session）だけでは false", () => {
    // admin_session は HttpOnly なので JS からは常に読めない想定。
    // 万が一 cookie 文字列に混ざっても、admin_csrf と同居していなければ
    // false で正しい（csrf ペアが無い = 状態変更操作が不可能）。
    setCookie("admin_session=xxx; path=/");
    expect(hasAdminSession()).toBe(false);
  });
});
