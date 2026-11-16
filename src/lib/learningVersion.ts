/**
 * 学習の記録（word_stats・srs_state）を書いた回数の目印。
 * 記録を書くたびに進め、まとめ読み（lib/learningSnapshot）は、目印が進んでいたら覚えた中身を捨てて取り直す。
 * ほかのモジュールに依存しない（wordStats・srsEngine と learningSnapshot が互いを import しないため）。
 */
let version = 0;

export function learningVersion(): number {
  return version;
}

export function bumpLearningVersion(): void {
  version += 1;
}
