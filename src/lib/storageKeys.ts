// 学習履歴・設定で使う localStorage キーの中央レジストリ。
// 新しい key を追加するときは必ずここにも追記し、Export/Import の対象に含めること。
// (キー名を deploy で迂闊に変えると旧データが orphan 化するため、refactor は禁止)
export const STORAGE_KEYS = {
  // === 学習進捗 (絶対に export/import に含める) ===
  yomiProgress: 'kobun-yomi-progress',          // 読解レイヤー進捗 / tokensViewed
  yomiVocab: 'kobun-yomi-vocab',                // 単語帳エントリ
  yomiOpens: 'kobun-yomi-opens',                // ヒント・語注の開閉カウンタ
  streakLastActive: 'kobun.streak.lastActiveDate',
  streakDays: 'kobun.streak.days',
  streakLongest: 'kobun.streak.longest',
  quizTypeCorrect: 'kobun-quiz-type-correct',   // 多義語/記述クイズの per-qid 正答カウント

  // === 表示設定 (任意で export/import) ===
  reiwaTheme: 'kobun.reiwaTheme',                       // 令和テーマ
  characterTheme: 'kobun-tan:dashboard-character-theme', // 庭/ロボ
  wordRange: 'kobun-wordRange',
  polysemyRange: 'kobun-polysemyRange',
  wordQuizType: 'kobun-wordQuizType',
  polysemyQuizType: 'kobun-polysemyQuizType',
  wordNumQuestions: 'kobun-wordNumQuestions',
  polysemyNumQuestions: 'kobun-polysemyNumQuestions',
  currentMode: 'kobun-currentMode',
  categoryFilter: 'kobun-categoryFilter',

  // === ID / フラグ ===
  anonId: 'anonId',                              // legacy 匿名 ID (auth.uid 移行後は削除されてる)
  anonIdMigrated: 'anonId_migrated',            // 移行完了フラグ
  fullAccess: 'kobun:full-access',
  nanoCoach: 'kobun:nano-coach',
  cohort: 'kobun:cohort',                        // 所属コホート (学年・学校・クラス別教材セット)
} as const;

// Export/Import で扱うキー一覧 (上記 STORAGE_KEYS の値全部)
export const EXPORTABLE_KEYS: readonly string[] = Object.values(STORAGE_KEYS);
