import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAllReibun = vi.fn();
const fetchMeanings = vi.fn();
vi.mock("@/lib/kobun/reibunData", () => ({ fetchAllReibun, fetchMeanings }));

describe("reibunCache", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchAllReibun.mockReset();
    fetchMeanings.mockReset();
  });

  it("取れたら2回目以降は通信しない", async () => {
    fetchAllReibun.mockResolvedValue([{ id: "a" }]);
    fetchMeanings.mockResolvedValue([{ meaningKey: "m" }]);
    const { loadReibunAndMeanings } = await import("@/lib/kobun/reibunCache");
    await loadReibunAndMeanings();
    const [r, m] = await loadReibunAndMeanings();
    expect(r).toHaveLength(1);
    expect(m).toHaveLength(1);
    expect(fetchAllReibun).toHaveBeenCalledTimes(1);
    expect(fetchMeanings).toHaveBeenCalledTimes(1);
  });

  it("同時の呼び出しは1回にまとめる", async () => {
    fetchAllReibun.mockResolvedValue([{ id: "a" }]);
    fetchMeanings.mockResolvedValue([{ meaningKey: "m" }]);
    const { loadReibunAndMeanings } = await import("@/lib/kobun/reibunCache");
    await Promise.all([loadReibunAndMeanings(), loadReibunAndMeanings()]);
    expect(fetchAllReibun).toHaveBeenCalledTimes(1);
  });

  it("失敗（空）は覚えず、次に取り直す", async () => {
    fetchAllReibun.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "a" }]);
    fetchMeanings.mockResolvedValue([{ meaningKey: "m" }]);
    const { loadReibunAndMeanings } = await import("@/lib/kobun/reibunCache");
    expect((await loadReibunAndMeanings())[0]).toHaveLength(0);
    expect((await loadReibunAndMeanings())[0]).toHaveLength(1);
    expect(fetchAllReibun).toHaveBeenCalledTimes(2);
  });
});
