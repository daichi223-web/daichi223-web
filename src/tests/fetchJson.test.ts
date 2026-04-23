/**
 * fetchJsonAsset の smoke テスト。
 * Umbrella / SPA fallback 誤動作で HTML が返るケースを判定できること。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJsonAsset } from "../lib/fetchJson";

function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response>) {
  // @ts-expect-error — テスト用の簡易置換
  global.fetch = vi.fn(impl);
}

describe("fetchJsonAsset", () => {
  beforeEach(() => {
    // @ts-expect-error
    global.fetch = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("application/json body を success として返す", async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ foo: "bar" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    const r = await fetchJsonAsset<{ foo: string }>("/x.json");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.foo).toBe("bar");
  });

  it("200 OK で text/html が返った場合 intercepted 扱い", async () => {
    mockFetch(
      async () =>
        new Response("<!doctype html><html>...</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
    );
    const r = await fetchJsonAsset("/x.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("intercepted");
  });

  it("404 は not-found", async () => {
    mockFetch(async () => new Response("", { status: 404 }));
    const r = await fetchJsonAsset("/x.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("not-found");
  });

  it("5xx は network 扱い", async () => {
    mockFetch(async () => new Response("", { status: 502 }));
    const r = await fetchJsonAsset("/x.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("network");
  });

  it("fetch が throw した場合も network 扱い", async () => {
    mockFetch(async () => {
      throw new Error("boom");
    });
    const r = await fetchJsonAsset("/x.json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("network");
      expect(r.message).toContain("boom");
    }
  });

  it("content-type が application/json でも body が壊れていれば intercepted", async () => {
    mockFetch(
      async () =>
        new Response("<<not json>>", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    const r = await fetchJsonAsset("/x.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("intercepted");
  });
});
