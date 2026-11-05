/**
 * 偏りのないシャッフル（Fisher–Yates）。元の配列は変えない。
 * `arr.sort(() => rng() - 0.5)` は並びに偏りが出る（先頭に置いた正解が先頭に残りやすい等）ので使わない。
 * クライアント（src/）と API（api/）の両方から使う純粋関数。
 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
