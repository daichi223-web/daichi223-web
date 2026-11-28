// usageStumbles&export=words の本物のハンドラを、DB・認証・名簿を偽物にして動かす
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("../../api/_supabaseAdmin.js", () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));
vi.mock("../../api/_requireStaff.js", () => ({ requireStaff: vi.fn(async () => ({ actor: "t" })) }));
vi.mock("../../api/_usageIdentity.js", async (orig) => {
  const real = await orig<typeof import("../../api/_usageIdentity")>();
  return {
    ...real,
    loadIdentities: vi.fn(async () => ({
      identity: new Map([
        ["u1", { school: "KU", grade: 1, cls: 3 }],
        ["u2", { school: "KU", grade: 1, cls: 4 }],
      ]),
    })),
  };
});

import handler from "../../api/_teacher_usageStumbles";

const W = (id: string, n: number, wrong: number) => ({ id, n, wrong, users: 2, wrongUsers: 1, repeatUsers: 0, firstWrong: 1, confused: [] });

function call(query: Record<string, string>) {
  let status = 200;
  let body: any;
  const res: any = {
    setHeader: vi.fn(),
    status: (s: number) => ((status = s), res),
    json: (b: unknown) => ((body = b), res),
  };
  return Promise.resolve(handler({ method: "GET", query } as any, res)).then(() => ({ status, body }));
}

describe("usageStumbles export=words", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { words: [W("100-1", 4, 1), W("101-1", 5, 2), W("150-3", 7, 3), W("151-1", 9, 9), W("bad", 1, 1)] }, error: null });
  });

  it("下限なし（1回答・1人）で呼び、範囲の両端を含めて絞り、合計を出す", async () => {
    const { status, body } = await call({ from: "2026-11-01", to: "2026-11-26", export: "words", range: "101-150", school: "KU", grade: "1", cls: "3" });
    expect(status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("usage_stumbles");
    expect(args).toMatchObject({ p_min_n: 1, p_min_users: 1, p_users: ["u1"] });
    // 選択式だけ（○×・記述は数えない）
    expect(args.p_word_formats).toEqual(["word-meaning", "word-reverse", "sentence-meaning", "blank-fill", "example-comprehension"]);
    expect(body.formats).toEqual(args.p_word_formats);
    expect(args.p_from).toBe("2026-10-31T15:00:00.000Z"); // JST 11/1 0時
    expect(args.p_to).toBe("2026-11-26T15:00:00.000Z"); // JST 11/27 0時（11/26 を含む）
    expect(body.words.map((w: any) => w.id)).toEqual(["101-1", "150-3"]);
    expect(body.rangeTotals).toEqual({ words: 2, n: 12, wrong: 5 });
    expect(body.range).toEqual([101, 150]);
    expect(body.drillInfo).toBeUndefined();
  });

  it("kind=writing は記述だけで数え、kind を返す。既定は choice、形違いは 400", async () => {
    const { body } = await call({ export: "words", kind: "writing" });
    expect(rpc.mock.calls[0][1].p_word_formats).toEqual(["meaning-writing", "context-writing"]);
    expect(body.kind).toBe("writing");
    expect(body.formats).toEqual(["meaning-writing", "context-writing"]);
    const d = await call({ export: "words" });
    expect(d.body.kind).toBe("choice");
    const bad = await call({ export: "words", kind: "true-false" });
    expect(bad.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("範囲なしは全部（形の違う id も含む）", async () => {
    const { body } = await call({ export: "words" });
    expect(body.words).toHaveLength(5);
    expect(body.rangeTotals).toEqual({ words: 5, n: 26, wrong: 16 });
    expect(body.range).toBeNull();
  });

  it("範囲の形が違えば 400 で DB を呼ばない", async () => {
    const { status } = await call({ export: "words", range: "150-101" });
    expect(status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("export なしは今までどおり下限 5回答・3人（組まで絞ると 3・2）", async () => {
    rpc.mockResolvedValue({ data: { words: [], drills: [] }, error: null });
    await call({});
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_min_n: 5, p_min_users: 3 });
    await call({ cls: "3" });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_min_n: 3, p_min_users: 2 });
    // 画面の「つまずき」は今までどおり全形式（形式で絞らない）
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_word_formats");
  });
});
