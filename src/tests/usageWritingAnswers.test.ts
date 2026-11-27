// 誤答分析「学校・学年ごとの記述の誤答」：表記ゆれのまとめ方と、本物のハンドラ（DB・認証・名簿は偽物）
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupWritingWrongs } from "../../api/_writingAnswers";

const rpc = vi.fn();
const overridesIn = vi.fn();
vi.mock("../../api/_supabaseAdmin.js", () => ({
  supabaseAdmin: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ in: (...a: unknown[]) => overridesIn(...a) }) }) }),
  },
}));
vi.mock("../../api/_requireStaff.js", () => ({ requireStaff: vi.fn(async () => ({ actor: "t" })) }));
vi.mock("../../api/_usageIdentity.js", async (orig) => {
  const real = await orig<typeof import("../../api/_usageIdentity")>();
  return {
    ...real,
    loadIdentities: vi.fn(async () => ({
      identity: new Map([
        ["u1", { school: "KU", grade: 1, cls: 3 }],
        ["u2", { school: "KU", grade: 2, cls: 1 }],
        ["u3", { school: "UW", grade: 1, cls: 3 }],
      ]),
      piiDecrypted: true,
    })),
  };
});

import handler from "../../api/_teacher_usageWritingAnswers";

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

describe("記述の誤答のまとめ方", () => {
  it("normalize で表記ゆれをまとめ、人は重複なしで数え、いちばん多い書き方を見本にする", () => {
    const g = groupWritingWrongs([
      { id: "1-1", answer: "アワレ", user: "u1", n: 1 },
      { id: "1-1", answer: "あわれ", user: "u1", n: 2 },
      { id: "1-1", answer: "あわれ。", user: "u2", n: 1 },
      { id: "2-1", answer: "おかしい", user: "u3", n: 5 },
      { id: "2-1", answer: "  ", user: "u3", n: 1 }, // 空はとばす
    ]);
    expect(g).toEqual([
      { id: "1-1", answerNorm: "あわれ", sample: "あわれ", n: 4, users: 2 },
      { id: "2-1", answerNorm: "おかしい", sample: "おかしい", n: 5, users: 1 },
    ]);
  });
});

describe("usageWritingAnswers", () => {
  beforeEach(() => {
    rpc.mockReset();
    overridesIn.mockReset();
    rpc.mockResolvedValue({
      data: {
        items: [{ id: "1-1", n: 4, wrong: 3, users: 2, wrongUsers: 2 }],
        wrongs: [
          { id: "1-1", answer: "あわれ", user: "u1", n: 2 },
          { id: "1-1", answer: "アワレ", user: "u3", n: 1 },
        ],
      },
      error: null,
    });
    overridesIn.mockResolvedValue({ data: [{ qid: "1-1", answer_norm: "あわれ", label: "NG" }], error: null });
  });

  it("学校・学年で生徒を絞って DB に渡し、期間は JST の両端を含む", async () => {
    const { status, body } = await call({ from: "2026-11-01", to: "2026-11-27", school: "KU", grade: "1" });
    expect(status).toBe(200);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("usage_writing_answers");
    expect(args).toEqual({ p_from: "2026-10-31T15:00:00.000Z", p_to: "2026-11-27T15:00:00.000Z", p_users: ["u1"] });
    expect(body.registered).toBe(1);
    expect(body.items).toEqual([{ id: "1-1", n: 4, wrong: 3, users: 2, wrongUsers: 2 }]);
  });

  it("誤答はまとめて返し、教員が決めた言い方に印を付ける。生徒の ID は出さない", async () => {
    const { body } = await call({});
    expect(rpc.mock.calls[0][1].p_users).toEqual(["u1", "u2", "u3"]);
    expect(body.wrongs).toEqual([{ id: "1-1", answerNorm: "あわれ", sample: "あわれ", n: 3, users: 2, override: "NG" }]);
    expect(body.wrongsTotal).toBe(1);
    expect(JSON.stringify(body)).not.toMatch(/"u[123]"/);
    expect(body.roster.map((r: any) => `${r.school}${r.grade}-${r.cls}`).sort()).toEqual(["KU1-3", "KU2-1", "UW1-3"]);
  });

  it("DB のエラーは 500", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { status, body } = await call({});
    expect(status).toBe(500);
    expect(body.error).toContain("usage_writing_answers");
  });
});
