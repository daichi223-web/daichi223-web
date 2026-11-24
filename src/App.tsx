import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { returnLabels, safeReturnPath } from '@/lib/returnTo';
import { dataParser } from './utils/dataParser';
import { Word, MultiMeaningWord, type WordQuizType } from './types';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import type { WritingJudgeResult } from './lib/writingJudge';
import { judgeWritingAnswer, isDecided, toAutoFields } from './lib/writingJudgeRuntime';
import { WordQuizContent } from './components/quiz/WordQuizContent';
import { TrueFalseQuizContent } from './components/quiz/TrueFalseQuizContent';
import { ExampleComprehensionContent } from './components/quiz/ExampleComprehensionContent';
import { ContextWritingContent } from './components/quiz/ContextWritingContent';
import { quizMeanings } from './components/quiz/writingVerdict';
import { QuizBackground } from './components/quiz/QuizBackground';
import { QUIZ_BACKGROUND_COLORS, useQuizBackground, useQuizBackgroundColor } from './lib/quizBackground';
import { readChatTeacher } from './lib/chatTeacher';
import { recordAnswer } from './lib/wordStats';
import { compositionLine, pickQuestions, type Bucket } from './lib/quizSelector';
import { shuffle } from './lib/shuffle';
import { buildRetryRound, countScored } from './lib/quiz/retryRound';
import { buildWordQuiz, type QuizQuestion, type ResolvedWordQuizType } from './lib/quiz/wordQuiz';
import { loadWordQuizFiles, loadWordQuizRecords, preloadWordQuizFiles } from './lib/quiz/wordQuizData';
import { trapsOf } from './lib/quiz/modernTraps';
import { preloadFace } from './lib/portraitFaces';
import { readPortraitTone } from './lib/portraitTone';
import { readMyStage } from './lib/myStage';
import {
  EMPTY_SNAPSHOT,
  loadLearningSnapshot,
  statsMapOf,
  boxesOf,
  weakWordsOf,
  todayReviewOf,
  lastActivityOf,
  warmupWordsOf,
} from './lib/learningSnapshot';
import { recordQuizTypeCorrect } from './lib/quizTypeStats';
import { logEvent, markQuestionShown } from './lib/learningEvents';
import { composeTodaySet, estimateToday, countGrowth, growthLine, type TodayParts } from './lib/todaySession';
import { getActiveQuizRange, type QuizRange } from './lib/quizRange';
import { nextWordRange } from './lib/quiz/nextRange';
import { readStreak } from './lib/streak';
import { resetAnswerStreak } from './lib/answerStreak';
import { pickTrueFalseWrongMeaning } from './lib/senseEquivalence';
import {
  updateSrsState,
  getSrsBoxes,
  gapDays,
  WELCOME_BACK_GAP_DAYS,
} from './lib/srsEngine';

import VocabModal from './components/VocabModal';
import { IndexModal } from './components/IndexModal';
import { CHAPTERS, chapterFor, chapterColor } from './utils/chapters';
import bundledVocabIndex from './data/vocabIndex.json';
import { hasAdminSession } from './lib/adminSession';
import ReiwaThemePicker from './theme/ReiwaThemePicker';
import HomeReiwa from './components/HomeReiwa';
import { QuizResultScreen } from './components/quiz/QuizResultScreen';
import { QuizModeTabs, QuizSettingsPanel } from './components/quiz/QuizSettingsPanel';
import { QuizToolbar } from './components/quiz/QuizToolbar';

const WORD_QUIZ_LABELS: Record<WordQuizType, string> = {
  'auto': 'おまかせ（覚えるほど問いが難しくなる）',
  'word-meaning': '単語の意味を選ぶ',
  'word-reverse': '意味から単語を選ぶ', // 旧形式 (選択UIからは引退。保存値の互換用)
  'sentence-meaning': '例文から意味を選ぶ',
  'blank-fill': '空欄に入る語を選ぶ（テスト形式）',
  'meaning-writing': '意味を書いて答える',
};
// 設定パネルに出す形式（並び順どおり。旧形式 word-reverse は出さない）
const WORD_TYPE_OPTIONS = (['auto', 'word-meaning', 'sentence-meaning', 'blank-fill', 'meaning-writing'] as const).map(
  (value) => ({ value: value as WordQuizType, label: WORD_QUIZ_LABELS[value] })
);
const POLYSEMY_QUIZ_LABELS: Record<PolysemyQuizType, string> = {
  'example-comprehension': '例文と意味を結びつける',
  'true-false': '例文の訳の正誤を判断',
  'context-writing': '文脈から意味を書く',
};

const POLYSEMY_TYPE_OPTIONS = (['example-comprehension', 'true-false', 'context-writing'] as const).map(
  (value) => ({ value: value as PolysemyQuizType, label: POLYSEMY_QUIZ_LABELS[value] })
);

type AppMode = 'word' | 'polysemy';
type PolysemyQuizType = 'example-comprehension' | 'true-false' | 'context-writing';

interface TrueFalseQuestion {
  example: string;
  meaning: string;
  isCorrect: boolean;
  correctAnswer: Word;
  exampleIndex?: number;
  exampleKobun?: string;
  exampleModern?: string;
  senseId?: string;
}

interface PolysemyState {
  currentWordIndex: number;
  currentExampleIndex: number;
  words: MultiMeaningWord[];
  userAnswers: any[];
  quizType: PolysemyQuizType;
}

// 重複回避用ヘルパー関数（sessionStorage 利用）
const RECENT_CHOICES_KEY = 'kobun-recent-choices';
const MAX_RECENT_CHOICES = 12; // 最大12個まで記録（3問×4択）

function getRecentChoices(): string[] {
  try {
    const stored = sessionStorage.getItem(RECENT_CHOICES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentChoice(qid: string) {
  try {
    const recent = getRecentChoices();
    const updated = [qid, ...recent.filter(id => id !== qid)].slice(0, MAX_RECENT_CHOICES);
    sessionStorage.setItem(RECENT_CHOICES_KEY, JSON.stringify(updated));
  } catch {
    // sessionStorage が使えない場合は無視
  }
}

function App() {
  // Core state with localStorage persistence for mode
  const [currentMode, setCurrentMode] = useLocalStorageState<AppMode>('kobun-currentMode', 'word');
  const [allWords, setAllWords] = useState<Word[]>([]);
  // qid → 単語データの行（API の選択肢に辞書の形 senseNorm を補う）
  const [isLoading, setIsLoading] = useState(true);
  // 出題の作り直しの通し番号。最後に始めた作り直しだけを画面に反映する（2026-11-04）。
  // 作成中にモード・範囲を変えると、古い作成が後から新しい出題を上書きしたり、作成中の印が立ったままになって
  // 以後の作り直しが止まったりしていた（「単語モードを選んでも一回表示されない」）
  const setupSeqRef = useRef(0);
  // いまの出題を作ったときの opts（語を絞った出題で形式を変えたとき、同じ並び・同じ問題数で作り直す）
  const lastSetupOptsRef = useRef<{ sequential?: boolean; numQuestions?: number } | undefined>(undefined);
  // 間違えた語の「もう一度」を、このセッションで既に足したか（setupQuiz で戻す）
  const retryAddedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [homeDataError, setHomeDataError] = useState(false);

  // Word mode settings with localStorage persistence
  const [wordQuizType, setWordQuizType] = useLocalStorageState<WordQuizType>('kobun-wordQuizType', 'auto');

  // 旧形式「意味から単語を選ぶ」は空欄補充へ移行 (保存値のマイグレーション)
  useEffect(() => {
    if (wordQuizType === 'word-reverse') setWordQuizType('blank-fill');
  }, []);
  const [wordNumQuestions, setWordNumQuestions] = useLocalStorageState<number>('kobun-wordNumQuestions', 10);
  // 出題の選び方: auto = 学習記録から配分（単語は範囲の未着手を先に7割→期限・苦手→途中、多義語は苦手→未着手→途中）、得意は頻度を下げる。random = 従来
  const [pickMode, setPickMode] = useLocalStorageState<'auto' | 'random'>('kobun-pickMode', 'auto');
  const [lastPick, setLastPick] = useState<Record<Bucket, number> | null>(null);
  const [wordRange, setWordRange] = useLocalStorageState<{from?: number; to?: number}>('kobun-wordRange', { from: 1, to: 50 });
  // 単語帳カテゴリ絞り込み (重要動詞/敬語動詞/...) — 空配列は「全て」
  // カテゴリ絞り込み（URL ?category= から入ったときだけ）。2026-11-16：端末に覚えるのをやめた。
  // 設定欄のカテゴリ chips を隠したあとも古い値が端末に残り、見えないまま範囲を絞って「出題範囲に単語が見つかりません」になっていた
  // （ユーザー指摘「単語モードの10」「最初の10個は出た」。例：重要動詞が残っていると 11〜20 に該当語が無い）。残っている値は起動時に消す。
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  useEffect(() => {
    try { localStorage.removeItem('kobun-categoryFilter'); } catch { /* 使えない環境では何もしない */ }
  }, []);

  // Polysemy mode settings with localStorage persistence
  const [polysemyQuizType, setPolysemyQuizType] = useLocalStorageState<PolysemyQuizType>('kobun-polysemyQuizType', 'example-comprehension');
  const [polysemyNumQuestions, setPolysemyNumQuestions] = useLocalStorageState<number>('kobun-polysemyNumQuestions', 5);
  const [polysemyRange, setPolysemyRange] = useLocalStorageState<{from?: number; to?: number}>('kobun-polysemyRange', { from: 1, to: 10 });

  // 範囲変更ハンドラー（開始が終了を超えたら終了を開始に合わせる）
  const handleWordRangeChange = useCallback((newRange: {from?: number; to?: number}) => {
    const adjustedRange = { ...newRange };
    // 開始が終了を超えたら、終了を開始に合わせる
    if (adjustedRange.from !== undefined && adjustedRange.to !== undefined && adjustedRange.from > adjustedRange.to) {
      adjustedRange.to = adjustedRange.from;
    }
    setWordRange(adjustedRange);
  }, []);

  const handlePolysemyRangeChange = useCallback((newRange: {from?: number; to?: number}) => {
    const adjustedRange = { ...newRange };
    // 開始が終了を超えたら、終了を開始に合わせる
    if (adjustedRange.from !== undefined && adjustedRange.to !== undefined && adjustedRange.from > adjustedRange.to) {
      adjustedRange.to = adjustedRange.from;
    }
    setPolysemyRange(adjustedRange);
  }, []);

  // Quiz state
  const [currentQuizData, setCurrentQuizData] = useState<QuizQuestion[] | TrueFalseQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [nextButtonVisible, setNextButtonVisible] = useState(false);
  const [showWritingResult, setShowWritingResult] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingJudgeResult>({ verdict: 'pending' });
  // 正解の大きな○。今は多義語の○×（handleTrueFalseAnswer）だけが使う。単語クイズは答え合わせの吹き出し（ChatFeedback）に移った（2026-11-02）
  const [showCorrectCircle, setShowCorrectCircle] = useState(false);
  // 単語クイズ画面の和柄（端末ごと）。出題には関係しないので、setupQuiz を再実行する useEffect の依存には入れない
  const [quizBackground] = useQuizBackground();
  const [quizBackgroundColor] = useQuizBackgroundColor();
  const [writingUserJudgment, setWritingUserJudgment] = useState<boolean | undefined>(undefined);
  const [currentWritingQid, setCurrentWritingQid] = useState<string>('');
  const [vocabLemma, setVocabLemma] = useState<string | null>(null);
  const vocabIndexKeys = useMemo(
    () => new Set(Object.keys(bundledVocabIndex as Record<string, unknown>)),
    []
  );

  const hasVocab = (lemma: string | undefined) =>
    !!lemma && vocabIndexKeys.has(lemma);

  const lemmaOfQid = (qid: string): string | undefined =>
    allWords.find((w) => w.qid === qid)?.lemma;
  const [currentWritingAnswerId, setCurrentWritingAnswerId] = useState<string>('');
  // 回答の本文を送った返事を待つ約束。返事（answerId）が届く前に「合っていた／ちがった」を押しても、
  // 届いてから自己判定を送れるように持っておく（2026-11-16。今までは届く前に押すと判定が送られなかった）
  const writingAnswerIdRef = useRef<Promise<string | null> | null>(null);

  // Wrong answers tracking for session-end review
  const [wrongAnswers, setWrongAnswers] = useState<Array<{ lemma: string; sense: string; qid: string }>>([]);

  // Index modal state
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  // テーマ画面を開いたときに送る欄（ホームの先生の絵から開くと 'teacher'）
  const [themeFocus, setThemeFocus] = useState<'teacher' | null>(null);
  const [showHome, setShowHome] = useState(true);
  // 苦手単語 / SRS 復習用に、特定の qid セットだけで出題する場合に使う
  const [quizQidFilter, setQuizQidFilter] = useState<string[] | null>(null);
  // 教材・単語カードから単語クイズに来たときの戻り先（?back=。教材画面と単語カードのパスだけ受け付ける）。ホームに戻ったら消す（2026-10-25、単語カードは 2026-11-06）
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const navigate = useNavigate();
  const [quizMode, setQuizMode] = useState<'normal' | 'weak' | 'srs' | 'focus' | 'today'>('normal');
  const [searchParams, setSearchParams] = useSearchParams();
  const [weakWordsCount, setWeakWordsCount] = useState(0);
  const [dueWordsCount, setDueWordsCount] = useState(0);
  // 今日の分に入る復習の数（範囲内だけ。ホームの「復習 N語 ＋ 新しく M語」に使う）
  const [todayDueCount, setTodayDueCount] = useState(0);
  // 長い空白のあとの「おかえり」: 空白日数と、箱4〜5からのウォームアップ語
  const [welcomeBack, setWelcomeBack] = useState<{ gapDays: number; warmup: string[] } | null>(null);
  // 「今日の分」: 出題した qid・開始時の箱（終了画面の成長1行用）・内訳
  const [todaySession, setTodaySession] = useState<{
    qids: string[];
    boxesBefore: Record<string, number>;
    parts: TodayParts;
  } | null>(null);
  const [todayGrowth, setTodayGrowth] = useState<string | null>(null);
  // 教員が設定した小テスト範囲（ホーム最上段）
  const [quizRange, setQuizRange] = useState<QuizRange | null>(null);
  // 累計学習統計 (Result 画面で表示)
  const [cumulativeStats, setCumulativeStats] = useState<{
    totalAnswered: number;
    totalCorrect: number;
    masteredCount: number; // 80%以上正解 + 5回以上挑戦
  }>({ totalAnswered: 0, totalCorrect: 0, masteredCount: 0 });

  // URL クエリ ?qid=A,B,C で外部から特定 qid のクイズを起動
  // 他画面 (TextReader / VocabPage / Stats / Search) からシームレスに飛んでくる経路。
  useEffect(() => {
    if (allWords.length === 0) return; // データロード前はスキップ
    const qidParam = searchParams.get('qid');
    if (!qidParam) return;
    const qids = qidParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (qids.length === 0) return;
    // 重複起動を防ぐため、URL から qid を消す
    const next = new URLSearchParams(searchParams);
    next.delete('qid');
    setReturnTo(safeReturnPath(searchParams.get('back')));
    next.delete('back');
    setSearchParams(next, { replace: true });
    setQuizQidFilter(qids);
    setQuizMode('focus');
    setCurrentMode('word');
    setShowHome(false);
    void setupQuiz(qids, null, undefined, 'word');
  }, [allWords.length]);

  // URL クエリ ?category=重要動詞,敬語動詞 でカテゴリ絞り込みクイズを起動
  // 単語帳カテゴリタップなどから流入する経路。
  useEffect(() => {
    if (allWords.length === 0) return;
    const catParam = searchParams.get('category');
    if (!catParam) return;
    const cats = catParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (cats.length === 0) return;
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    setSearchParams(next, { replace: true });
    setCategoryFilter(cats);
    setQuizQidFilter(null);
    setCurrentMode('word');
    setShowHome(false);
    void setupQuiz(undefined, null, undefined, 'word');
  }, [allWords.length]);

  // URL クエリ ?chapter=ch1 で章範囲のクイズを起動。
  // 装束ダッシュボード (NobleStatsDashboard) の5ジャンルタップ → 該当章のクイズへ飛ぶ。
  useEffect(() => {
    if (allWords.length === 0) return;
    const chParam = searchParams.get('chapter');
    if (!chParam) return;
    const ch = CHAPTERS.find((c) => c.id === chParam);
    if (!ch) return;
    const next = new URLSearchParams(searchParams);
    next.delete('chapter');
    setSearchParams(next, { replace: true });
    setWordRange({ from: ch.start, to: ch.end });
    setCategoryFilter([]); // 章絞り込み時はカテゴリは外す (範囲のみで出題)
    setQuizQidFilter(null);
    setCurrentMode('word');
    setShowHome(false);
    void setupQuiz(undefined, null, undefined, 'word');
  }, [allWords.length]);

  // URL クエリ ?mode=word / ?mode=polysemy でクイズを直接始める（2026-11-06。状態遷移の見直し 案 E）。
  // 単語ホームの「練習する」など、ほかの画面からクイズへ直接つなぐ道。今までは "/" へ移るとホームが出るだけだった。
  // ホームを開いたまま同じアドレスへ移ったときも動くよう、クエリの値を依存に入れる。
  const modeParam = searchParams.get('mode');
  // 単語データを読み込んだ直後の1回目かどうか（下の「Initial quiz setup」が出題を作る回）
  const modeEffectRanRef = useRef(false);
  useEffect(() => {
    if (allWords.length === 0) return;
    const justLoaded = !modeEffectRanRef.current;
    modeEffectRanRef.current = true;
    if (modeParam !== 'word' && modeParam !== 'polysemy') return;
    // ?qid（特定の語のクイズ）と一緒に来たときは ?qid を優先する
    if (searchParams.get('qid')) return;
    // 重複起動を防ぐため、URL から mode を消す
    const next = new URLSearchParams(searchParams);
    next.delete('mode');
    setSearchParams(next, { replace: true });
    // ここから下はホームの「単語」「多義語」タイル（onSwitchMode）と同じ考え：
    // モードも絞り込みも変わらないときは作り直しの useEffect が走らないので、出題が空・結果画面のままならここで作り直す。
    const unchanged = modeParam === currentMode && quizQidFilter == null;
    setQuizQidFilter(null);
    setQuizMode('normal');
    setCurrentMode(modeParam);
    setShowHome(false);
    // 読み込んだ直後の1回目は「Initial quiz setup」が出題を作る。ここでも呼ぶと選択肢を二重に取りに行くので呼ばない
    if (!justLoaded && unchanged && (currentQuizData.length === 0 || showResults)) {
      void setupQuiz(undefined, null, undefined, modeParam);
    }
  }, [allWords.length, modeParam]);

  // 今日の分の候補＝範囲（＋分類）の語。今日の復習・おかえりの語もこの中だけから取る
  // （2026-11-24 ユーザー指示。前は範囲外の期限が来た語も混ざっていた）。rangeOverride は小テスト範囲（分類は見ない）
  const todayPoolOf = (rangeOverride?: { from: number; to: number }): Word[] => {
    const start = rangeOverride?.from ?? wordRange.from ?? 1;
    const end = rangeOverride?.to ?? wordRange.to ?? 330;
    let pool = allWords.filter((w) => w.group >= start && w.group <= end);
    if (categoryFilter.length > 0 && !rangeOverride) {
      const catSet = new Set(categoryFilter);
      const vidx = bundledVocabIndex as Record<string, { category?: string }>;
      pool = pool.filter((w) => {
        const c = vidx[w.lemma]?.category;
        return c ? catSet.has(c) : false;
      });
    }
    return pool;
  };

  // ホーム表示時に学習履歴ベースの集計を取得
  // 2026-11-16：学習の記録はまとめ読み1回（word_stats と srs_state を同時に）にし、苦手・今日の復習・
  // 最後に解いた日・おかえりの語は手元で計算する（lib/learningSnapshot。前は項目ごとに DB を引いていた）。
  // 単語データが入る前は動かさない（前は空の一覧で1回よけいに走っていた）
  useEffect(() => {
    if (!showHome || allWords.length === 0) return;
    let cancelled = false;
    setHomeDataError(false);
    (async () => {
      try {
        const qids = allWords.map(w => w.qid);
        const poolQids = todayPoolOf().map(w => w.qid);
        const [snap, range] = await Promise.all([loadLearningSnapshot(), getActiveQuizRange()]);
        const weak = weakWordsOf(snap, qids);
        const today = todayReviewOf(snap, qids);
        const todayInRange = todayReviewOf(snap, poolQids);
        const gap = gapDays(lastActivityOf(snap));
        const warmup = gap != null && gap >= WELCOME_BACK_GAP_DAYS ? warmupWordsOf(snap, poolQids) : [];
        if (!cancelled) {
          setWeakWordsCount(weak.length);
          setDueWordsCount(today.length);
          setTodayDueCount(todayInRange.length);
          setQuizRange(range);
          setWelcomeBack(gap != null && gap >= WELCOME_BACK_GAP_DAYS && warmup.length > 0 ? { gapDays: gap, warmup } : null);
        }
      } catch {
        if (!cancelled) {
          setHomeDataError(true);
          setWeakWordsCount(0);
          setDueWordsCount(0);
          setTodayDueCount(0);
          setWelcomeBack(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showHome, allWords, wordRange.from, wordRange.to, categoryFilter]);

  // 結果表示時に累計統計を取得
  useEffect(() => {
    if (!showResults) return;
    let cancelled = false;
    (async () => {
      try {
        const stats = statsMapOf(await loadLearningSnapshot().catch(() => EMPTY_SNAPSHOT));
        if (cancelled) return;
        let totalAnswered = 0;
        let totalCorrect = 0;
        let mastered = 0;
        for (const s of Object.values(stats)) {
          const n = s.correct + s.incorrect;
          totalAnswered += n;
          totalCorrect += s.correct;
          if (n >= 5 && s.correct / n >= 0.8) mastered += 1;
        }
        setCumulativeStats({ totalAnswered, totalCorrect, masteredCount: mastered });
      } catch {
        // silent fail (offline 等)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showResults]);
  // 「今日の分」終了時: 開始時の箱と比べて成長1行を作る（最後の回答の反映を少し待つ）
  useEffect(() => {
    if (!showResults || quizMode !== 'today' || !todaySession) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const after = await getSrsBoxes(todaySession.qids);
        if (cancelled) return;
        const g = countGrowth(todaySession.qids, todaySession.boxesBefore, after);
        setTodayGrowth(growthLine(g, readStreak().current));
      } catch {
        // 出さないだけ
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [showResults, quizMode, todaySession]);

  // モード切替時に「同じ語」を新モードの第一問に引き継ぐための seed lemma。
  // currentMode 変更を契機に useEffect が setupQuiz(undefined, seed) を呼ぶ。
  const [pendingSeedLemma, setPendingSeedLemma] = useState<string | null>(null);
  const [indexSearchQuery, setIndexSearchQuery] = useState('');

  // Polysemy mode state
  const [polysemyState, setPolysemyState] = useState<PolysemyState>({
    currentWordIndex: 0,
    currentExampleIndex: 0,
    words: [],
    userAnswers: [],
    quizType: 'example-comprehension'
  });

  // 学習の出来事の記録（分析用）: 問いが切り替わった時刻を記し、回答に応答時間を付ける
  useEffect(() => {
    markQuestionShown();
  }, [currentQuestionIndex, currentQuizData, polysemyState.currentWordIndex, polysemyState.currentExampleIndex]);

  // Filter words for index based on search query (defined early for indexButton)
  // Group by lemma to show unique headwords (330 instead of 631)
  const filteredIndexWords = useMemo(() => {
    if (!Array.isArray(allWords) || allWords.length === 0) return [];

    // Group words by group number, taking first word for each group
    const groupMap = new Map<number, Word>();
    allWords.forEach(word => {
      if (!groupMap.has(word.group)) {
        groupMap.set(word.group, word);
      }
    });

    const uniqueWords = Array.from(groupMap.values()).sort((a, b) => a.group - b.group);

    if (!indexSearchQuery) return uniqueWords;

    const query = indexSearchQuery.toLowerCase();
    return uniqueWords.filter(word =>
      word?.lemma?.toLowerCase().includes(query) ||
      word?.sense?.toLowerCase().includes(query) ||
      word?.group?.toString().includes(query)
    );
  }, [allWords, indexSearchQuery]);

  useEffect(() => {
    loadData();
    // 出題に使うファイルを先に読み始める（出題を作るときに待たない。lib/quiz/wordQuizData）
    preloadWordQuizFiles();
    // 答え合わせに出る自分の顔（小さい画像）も先に取っておく
    preloadFace(readPortraitTone(), readMyStage().n);
  }, []);

  // Initial quiz setup when data loads or settings change
  useEffect(() => {
    if (allWords.length > 0) {
      // フォーカスクイズ (?qid 経由 / 苦手復習 / SRS復習) が処理中は
      // デフォルト範囲の上書きセットアップを走らせない。
      // URL に ?qid が残っている場合は qid 効果側がまだ走っていないので
      // 同様に抑止 (race condition 回避)。
      if (quizQidFilter || searchParams.get('qid')) return;

      // モード切替で seed lemma が設定されていれば第1問に同じ語を引き継ぐ
      const seed = pendingSeedLemma;
      if (seed) setPendingSeedLemma(null);
      void setupQuiz(undefined, seed);
    }
    // pendingSeedLemma は意図的に依存に入れない (mode/range 変更時に最新値を closure で拾う)
  }, [
    currentMode,
    wordQuizType, wordNumQuestions, wordRange.from, wordRange.to,
    polysemyQuizType, polysemyNumQuestions, polysemyRange.from, polysemyRange.to,
    allWords.length,
    quizQidFilter,
    categoryFilter,
  ]);

  // 語を絞った出題（ヒートマップ・教材・苦手・今日の分から来たクイズ）の途中で形式を変えたとき。
  // 上の作り直しは絞り込み中は走らないので、同じ語のまま新しい形式で作り直す
  // （2026-11-16 ユーザー指摘「ヒートマップから単語に飛んで、形式を変えても切り替わらない」）。
  const prevWordQuizTypeRef = useRef(wordQuizType);
  useEffect(() => {
    const changed = prevWordQuizTypeRef.current !== wordQuizType;
    prevWordQuizTypeRef.current = wordQuizType;
    if (!changed) return;
    if (allWords.length === 0 || !quizQidFilter || currentMode !== 'word') return;
    void setupQuiz(quizQidFilter, null, lastSetupOptsRef.current, 'word');
  }, [wordQuizType]);


  const loadData = async () => {
    try {
      setIsLoading(true);
      await dataParser.loadData();
      const words = dataParser.getAllWords();
      setAllWords(words);
      setError(null);
    } catch (err) {
      setError('データの読み込みに失敗しました。');
      console.error('Data loading error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const showErrorMessage = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 10000);
  };

  const validateRangeInput = (start: number | undefined, end: number | undefined, maxValue: number = 330) => {
    if (start !== undefined && end !== undefined) {
      if (start > end) {
        showErrorMessage('開始値は終了値以下である必要があります。');
        return false;
      }
      if (start > maxValue || end > maxValue) {
        showErrorMessage(`値は${maxValue}以下である必要があります。`);
        return false;
      }
    }
    if (start !== undefined && start < 1) {
      showErrorMessage('開始値は1以上である必要があります。');
      return false;
    }
    if (end !== undefined && end < 1) {
      showErrorMessage('終了値は1以上である必要があります。');
      return false;
    }
    return true;
  };

  const getPolysemyWords = (words: Word[], rangeStart: number, rangeEnd: number): MultiMeaningWord[] => {
    const wordGroups: { [key: string]: Word[] } = {};

    words.forEach(word => {
      // Defensive check: ensure word exists and has required properties
      if (!word || !word.lemma || typeof word.lemma !== 'string') {
        console.warn('Invalid word object found:', word);
        return;
      }

      if (word.group >= rangeStart && word.group <= rangeEnd) {
        if (!wordGroups[word.lemma]) {
          wordGroups[word.lemma] = [];
        }
        wordGroups[word.lemma].push(word);
      }
    });

    return Object.entries(wordGroups)
      .filter(([_, meanings]) => meanings.length >= 2)
      .map(([lemma, meanings]) => ({ lemma, meanings }));
  };

  // opts.sequential: フィルタの並び順どおりに出題（復習＝期限の古い順、おかえり＝ウォームアップを先頭）
  // opts.numQuestions: このセッションだけ出題数を上書き
  type QuizOpts = { sequential?: boolean; numQuestions?: number };
  // modeOverride: setCurrentMode 直後は closure の currentMode が古いので、呼び出し側でモードを明示できる
  const setupQuiz = async (
    qidFilterOverride?: string[],
    seedLemma?: string | null,
    opts?: QuizOpts,
    modeOverride?: 'word' | 'polysemy',
  ) => {
    const seq = ++setupSeqRef.current;
    lastSetupOptsRef.current = opts;
    retryAddedRef.current = false;
    // Reset all quiz states when switching modes
    setShowResults(false);
    setIsQuizActive(false);
    setCurrentQuestionIndex(0);
    setCurrentQuizData([]);
    setScore(0);
    resetAnswerStreak(); // 連続正解は1回のクイズの中で数える（lib/answerStreak）
    setNextButtonVisible(false);
    setShowWritingResult(false);
    setShowCorrectCircle(false);
    setWrongAnswers([]);

    if ((modeOverride ?? currentMode) === 'word') {
      await setupWordQuiz(qidFilterOverride, seedLemma ?? undefined, opts, seq);
    } else {
      await setupPolysemyQuiz(seedLemma ?? undefined, seq);
    }
  };

  // 「今日の分」: おかえり語 → 今日の復習 → 範囲内からおまかせ補充、で基本10問。
  // 中身はアプリが決め、生徒はボタン1つで始める。again=true は「もう1セット」（おかえり語は付けない）。
  const startTodaySession = async (again = false, rangeOverride?: { from: number; to: number }) => {
    const pool = todayPoolOf(rangeOverride);
    const inRange = new Set(pool.map((w) => w.qid));
    // おかえりの語・今日の復習も範囲内だけ（範囲外の語は混ぜない）
    const warmup = again ? [] : (welcomeBack?.warmup ?? []).filter((q) => inRange.has(q));
    // 今日の復習・成績・箱は、学習の記録のまとめ読みから（2026-11-16。ホームで読んだものが残っていれば通信なし）。
    // 取れなければ復習なし・全部「未着手」として補充する
    const snap = await loadLearningSnapshot().catch(() => EMPTY_SNAPSHOT);
    const stats: Record<string, { correct: number; incorrect: number; lastSeen?: string | null }> = statsMapOf(snap);
    const boxes: Record<string, number> = boxesOf(snap);
    // 範囲内の語で期限の古い順に取る（前は全語で上限まで取ってから範囲で絞っていたので、範囲内の復習が欠けることがあった）
    const due: string[] = todayReviewOf(snap, pool.map((w) => w.qid));
    const set = composeTodaySet({
      warmup,
      due,
      pool,
      key: (w) => w.qid,
      order: (w) => w.group * 100 + (w.meaning_idx ?? 0),
      group: (w) => w.group, // 新しい語は各語の1つめの意味から（範囲の語がまんべんなく出る）
      stats,
      boxes,
    });
    if (set.qids.length === 0) {
      // 範囲に語が無い等。通常クイズにフォールバック
      setQuizQidFilter(null);
      setQuizMode('normal');
      setShowHome(false);
      void setupQuiz();
      return;
    }
    // 始める前の箱（終わったあとの成長1行に使う）。箱の無い語は未学習。記録が取れなかったときは空（成長1行が出ないだけ）
    const boxesBefore: Record<string, number> = {};
    for (const q of set.qids) if (boxes[q] != null) boxesBefore[q] = boxes[q];
    setTodaySession({ qids: set.qids, boxesBefore, parts: set.parts });
    setTodayGrowth(null);
    setLastPick(set.parts.freshComposition);
    setQuizQidFilter(set.qids);
    setQuizMode('today');
    setCurrentMode('word');
    setShowHome(false);
    void setupQuiz(set.qids, null, { sequential: true, numQuestions: set.qids.length }, 'word');
  };

  // 現在のクイズで出題中の lemma を返す (モード切替の seed 用)。
  const getCurrentLemma = (): string | null => {
    if (currentMode === 'word' && currentQuizData[currentQuestionIndex]) {
      const q = currentQuizData[currentQuestionIndex] as QuizQuestion;
      return q.correct?.lemma ?? null;
    }
    if (currentMode === 'polysemy') {
      const tf = currentQuizData[currentQuestionIndex] as TrueFalseQuestion | undefined;
      if (tf?.correctAnswer?.lemma) return tf.correctAnswer.lemma;
      const w = polysemyState.words[polysemyState.currentWordIndex];
      if (w?.lemma) return w.lemma;
    }
    return null;
  };

  const setupWordQuiz = async (qidFilterOverride?: string[], seedLemma?: string, opts?: QuizOpts, seq?: number) => {
    // 後から別の作り直しが始まっていたら、この結果は捨てる
    const stale = () => seq !== undefined && seq !== setupSeqRef.current;
    // qid フィルタ (引数優先、次に state)。指定があれば苦手単語 / SRS 復習として
    // その qid のみ出題、なければ範囲で絞り込む
    const filter = qidFilterOverride ?? quizQidFilter;
    const emptyMessage = () =>
      filter && filter.length > 0
        ? wordQuizType === 'blank-fill'
          ? 'この単語には空欄の問題がありません。ほかの形式を選んでください。'
          : '対象となる単語が見つかりません。'
        : wordQuizType === 'blank-fill'
        ? 'この範囲には空欄テキストのある単語がありません（範囲331以降は非対応）。'
        : '出題範囲に単語が見つかりません。';
    let targetWords: Word[];
    if (filter && filter.length > 0) {
      const qidSet = new Set(filter);
      targetWords = allWords.filter((w) => qidSet.has(w.qid));
      if (opts?.sequential) {
        // フィルタの順序を保つ（allWords.filter は allWords 順になるため並べ直す）
        const order = new Map(filter.map((q, i) => [q, i]));
        targetWords.sort((a, b) => (order.get(a.qid) ?? 0) - (order.get(b.qid) ?? 0));
      }
    } else {
      const start = wordRange.from ?? 1;
      const end = wordRange.to ?? 330;
      targetWords = allWords.filter(word =>
        word.group >= start && word.group <= end
      );
      // カテゴリ絞り込み (vocabIndex.json の category と AND)
      if (categoryFilter.length > 0) {
        const catSet = new Set(categoryFilter);
        const vidx = bundledVocabIndex as Record<string, { category?: string }>;
        targetWords = targetWords.filter((w) => {
          const c = vidx[w.lemma]?.category;
          return c ? catSet.has(c) : false;
        });
      }
    }

    if (targetWords.length < 1) {
      if (allWords.length > 0) showErrorMessage(emptyMessage());
      return;
    }

    // 材料を同時に取る：ファイル（空欄の例文・実戦例文・例文ごとの手当て。初回だけ通信）と学習の記録（成績・箱・期限）。
    // 組み立ては lib/quiz/wordQuiz の純関数で、通信しない（2026-11-16。選択肢の API 呼び出しをやめた）
    const autoPick = !filter && pickMode === 'auto';
    const [files, records] = await Promise.all([
      loadWordQuizFiles(wordQuizType === 'blank-fill' || wordQuizType === 'auto'),
      loadWordQuizRecords(targetWords.map((w) => w.qid), autoPick),
    ]);
    if (stale()) return;

    const result = buildWordQuiz({
      targetWords,
      allWords,
      quizType: wordQuizType,
      numQuestions: opts?.numQuestions ?? wordNumQuestions,
      autoPick,
      sequential: opts?.sequential,
      seedLemma,
      blanks: files.blanks,
      records,
      corpus: files.corpus,
      exampleContexts: files.exampleContexts,
      trapsOf,
      recentChoices: getRecentChoices(),
      examplesOf: (w) => dataParser.getExamplesForSense(w, w.qid, dataParser.getWordByLemma(w.lemma)),
    });
    if (!result.ok) {
      if (allWords.length > 0) showErrorMessage(emptyMessage());
      return;
    }
    result.usedChoiceQids.forEach(addRecentChoice);
    if (result.composition) setLastPick(result.composition);

    setCurrentQuizData(result.questions);
    setCurrentQuestionIndex(0);
    setScore(0);
    resetAnswerStreak(); // 連続正解は1回のクイズの中で数える（lib/answerStreak）
    setIsQuizActive(true);
    setShowResults(false);
    setNextButtonVisible(false);
    setShowWritingResult(false);
  };

  const setupPolysemyQuiz = async (seedLemma?: string, seq?: number) => {
    const stale = () => seq !== undefined && seq !== setupSeqRef.current;
    const start = polysemyRange.from ?? 1;
    const end = polysemyRange.to ?? 330;
    const polysemyWords = getPolysemyWords(allWords, start, end);

    if (polysemyWords.length === 0) {
      if (allWords.length > 0) {
        showErrorMessage('指定された範囲に多義語が見つかりません。');
      }
      return;
    }

    // 出題する語を決める。
    //   おまかせ: 語（lemma）ごとに各意味の正誤を合算し、苦手→未着手（番号順）→途中 の配分で選ぶ
    //   ランダム: シャッフルして先頭から
    // seedLemma があれば先頭に固定 (モード切替時の語引継ぎ)。
    let ordered: MultiMeaningWord[] | null = null;
    if (pickMode === 'auto') {
      try {
        const stats = statsMapOf(await loadLearningSnapshot().catch(() => EMPTY_SNAPSHOT));
        const byLemma: Record<string, { correct: number; incorrect: number; lastSeen?: string | null }> = {};
        for (const w of polysemyWords) {
          let c = 0, i = 0, last: string | null = null;
          for (const m of w.meanings) {
            const st = stats[m.qid];
            if (!st) continue;
            c += st.correct; i += st.incorrect;
            if (st.lastSeen && (!last || st.lastSeen > last)) last = st.lastSeen;
          }
          if (c + i > 0) byLemma[w.lemma] = { correct: c, incorrect: i, lastSeen: last };
        }
        const r = pickQuestions({
          items: polysemyWords,
          key: (w) => w.lemma,
          order: (w) => Math.min(...w.meanings.map((m) => m.group)),
          stats: byLemma, n: polysemyNumQuestions,
        });
        if (r.picked.length > 0 && !stale()) { ordered = r.picked; setLastPick(r.composition); }
      } catch { /* ランダムにフォールバック */ }
    }
    if (!ordered) ordered = shuffle(polysemyWords);
    if (seedLemma) {
      const seedIdx = ordered.findIndex((w) => w.lemma === seedLemma);
      if (seedIdx > 0) {
        ordered = [ordered[seedIdx], ...ordered.filter((_, i) => i !== seedIdx)];
      } else if (seedIdx < 0) {
        const seed = polysemyWords.find((w) => w.lemma === seedLemma);
        if (seed) ordered = [seed, ...ordered];
      }
    }
    const selectedWords = ordered.slice(0, Math.min(polysemyNumQuestions, ordered.length));
    if (stale()) return;

    setPolysemyState({
      currentWordIndex: 0,
      currentExampleIndex: 0,
      words: selectedWords,
      userAnswers: [],
      quizType: polysemyQuizType
    });

    if (polysemyQuizType === 'true-false') {
      setupTrueFalseQuiz(selectedWords);
    } else {
      setCurrentQuizData([]);
    }

    setCurrentQuestionIndex(0);
    setScore(0);
    resetAnswerStreak(); // 連続正解は1回のクイズの中で数える（lib/answerStreak）
    setIsQuizActive(true);
    setShowResults(false);
    setNextButtonVisible(false);
    setShowWritingResult(false);
  };

  const setupTrueFalseQuiz = (words: MultiMeaningWord[]) => {
    const questions: TrueFalseQuestion[] = [];
    const numQuestions = words.length * 3;
    const MAX_RANDOM_ATTEMPTS = 50;
    // 失敗 (空例文 / wrongMeaning 確保不可) で continue した場合に再試行できるよう、
    // for ループではなく questions.length ベースの while で回す。
    // 上限を numQuestions * 10 に設定してデータ全空例文の極端ケースでも止まる。
    const MAX_TOTAL_ATTEMPTS = numQuestions * 10;

    // 例文が空の meaning は出題対象から除外するヘルパ。
    const firstExampleText = (m: Word): string | null => {
      const ex = m.examples?.[0];
      return ex?.jp ?? null;
    };

    let totalAttempts = 0;
    while (questions.length < numQuestions && totalAttempts < MAX_TOTAL_ATTEMPTS) {
      totalAttempts++;
      const wordGroup = words[questions.length % words.length];
      const isCorrect = Math.random() < 0.5;

      if (isCorrect) {
        const correctMeaning = wordGroup.meanings[Math.floor(Math.random() * wordGroup.meanings.length)];
        const exampleText = firstExampleText(correctMeaning);
        if (!exampleText) continue; // 例文無し → スキップ

        // Get examples for the correct meaning (sense-priority)
        const examples = dataParser.getExamplesForSense(correctMeaning, correctMeaning.qid, wordGroup);
        const exampleIndex = examples.kobun.length > 0 ? Math.floor(Math.random() * examples.kobun.length) : 0;

        questions.push({
          example: exampleText,
          meaning: correctMeaning.sense,
          isCorrect: true,
          correctAnswer: correctMeaning,
          exampleIndex,
          exampleKobun: dataParser.getEmphasizedExample(examples.kobun[exampleIndex] || '', correctMeaning.lemma),
          exampleModern: examples.modern[exampleIndex] || '',
          senseId: correctMeaning.qid
        });
      } else {
        const randomExample = wordGroup.meanings[Math.floor(Math.random() * wordGroup.meanings.length)];
        const exampleText = firstExampleText(randomExample);
        if (!exampleText) continue; // 例文無し → スキップ
        // 誤りの意味: 半々で同じ wordGroup 内の別の意味か、全単語からの別 lemma。
        // 正しい意味と紛れるもの（同じ意味・表記ちがいの語）は除く。試行上限と
        // 最終 null guard で無限ループ・undefined アクセスを防ぐ（lib/senseEquivalence）
        const wrongMeaning = pickTrueFalseWrongMeaning(
          randomExample, wordGroup.meanings, allWords, Math.random, MAX_RANDOM_ATTEMPTS
        );
        if (!wrongMeaning || !wrongMeaning.sense) continue; // 確保できなければスキップ

        // Get examples for the random example (sense-priority)
        const examples = dataParser.getExamplesForSense(randomExample, randomExample.qid, wordGroup);
        const exampleIndex = examples.kobun.length > 0 ? Math.floor(Math.random() * examples.kobun.length) : 0;

        questions.push({
          example: exampleText,
          meaning: wrongMeaning.sense,
          isCorrect: false,
          correctAnswer: randomExample,
          exampleIndex,
          exampleKobun: dataParser.getEmphasizedExample(examples.kobun[exampleIndex] || '', randomExample.lemma),
          exampleModern: examples.modern[exampleIndex] || '',
          senseId: randomExample.qid
        });
      }
    }

    if (totalAttempts >= MAX_TOTAL_ATTEMPTS && questions.length < numQuestions) {
      console.warn(
        `[setupTrueFalseQuiz] 試行上限 (${MAX_TOTAL_ATTEMPTS}) に達しました。` +
        `要求 ${numQuestions} 問に対し ${questions.length} 問のみ生成。` +
        `データに例文不足の meaning が多い可能性。`
      );
    }
    setCurrentQuizData(shuffle(questions));
  };

  // いま出している問題が、最後の「もう一度」（間違えた語の再出題）か
  const isRetryQuestion = (): boolean =>
    currentMode === 'word' && !!(currentQuizData[currentQuestionIndex] as QuizQuestion | undefined)?.retry;

  const handleAnswer = (selectedOption: Word, correctOption: Word, isReverse = false) => {
    const isCorrect = selectedOption.qid === correctOption.qid;
    const isRetry = isRetryQuestion();
    // Track word stats and SRS in Supabase (fire-and-forget)。最後の「もう一度」は練習なので進めない
    if (!isRetry) {
      recordAnswer(correctOption.qid, isCorrect).catch((e) => console.warn('[recordAnswer] failed:', e));
      updateSrsState(correctOption.qid, isCorrect).catch((e) => console.warn('[updateSrsState] failed:', e));
    }
    {
      const q = currentQuizData[currentQuestionIndex] as QuizQuestion | undefined;
      logEvent({
        area: 'vocab', action: 'answer', targetType: 'word', targetId: correctOption.qid,
        correct: isCorrect, chosen: selectedOption.qid,
        format: currentMode === 'word' ? (q?.resolvedType ?? wordQuizType) : polysemyQuizType,
        route: quizMode,
        ctx: {
          mode: currentMode, reverse: isReverse || undefined, choices: q?.options?.map((o) => o.qid),
          teacher: readChatTeacher(),
          ...(isRetry ? { retry: true } : {}),
        },
      });
    }
    if (isRetry) {
      setNextButtonVisible(true);
      return;
    }
    // 多義語モード(=例文理解クイズ等の選択式) の正答もカウント
    if (isCorrect && currentMode === 'polysemy') {
      recordQuizTypeCorrect(correctOption.qid, 'polysemy');
    }
    if (isCorrect) {
      setScore(prev => prev + 1);
      // 正解でも自動では進まない。答え合わせ（LINE 風の吹き出し）を見せ、タップか「つぎへ」で次へ（2026-11-02）
      setNextButtonVisible(true);
    } else {
      setNextButtonVisible(true);
      setWrongAnswers(prev => {
        if (prev.some(w => w.qid === correctOption.qid)) return prev;
        return [...prev, { lemma: correctOption.lemma, sense: correctOption.sense, qid: correctOption.qid }];
      });
    }
  };

  const handleTrueFalseAnswer = (userAnswer: boolean) => {
    const question = currentQuizData[currentQuestionIndex] as TrueFalseQuestion;
    const isCorrect = userAnswer === question.isCorrect;
    // Track word stats and SRS in Supabase (fire-and-forget)
    recordAnswer(question.correctAnswer.qid, isCorrect).catch((e) => console.warn('[recordAnswer] failed:', e));
    updateSrsState(question.correctAnswer.qid, isCorrect).catch((e) => console.warn('[updateSrsState] failed:', e));
    logEvent({
      area: 'vocab', action: 'answer', targetType: 'word', targetId: question.correctAnswer.qid,
      correct: isCorrect, chosen: String(userAnswer), format: 'true-false', route: quizMode,
      ctx: { mode: currentMode, shown: question.isCorrect },
    });
    // true-false は polysemy 専用なので正答時にカウント
    if (isCorrect) recordQuizTypeCorrect(question.correctAnswer.qid, 'polysemy');
    if (isCorrect) {
      setScore(prev => prev + 1);
      setShowCorrectCircle(true);
      setTimeout(() => {
        setShowCorrectCircle(false);
        setCurrentQuestionIndex(prev => prev + 1);
      }, 500);
    } else {
      setNextButtonVisible(true);
      const ca = question.correctAnswer;
      setWrongAnswers(prev => {
        if (prev.some(w => w.qid === ca.qid)) return prev;
        return [...prev, { lemma: ca.lemma, sense: ca.sense, qid: ca.qid }];
      });
    }
  };

  const addWrongAnswer = (qid: string) => {
    const word = allWords.find(w => w.qid === qid);
    if (!word) return;
    setWrongAnswers(prev =>
      prev.some(w => w.qid === qid) ? prev : [...prev, { lemma: word.lemma, sense: word.sense, qid }]
    );
  };

  // 記述の最終判定を記録する。1回の回答につき1回だけ呼ぶ
  // （自動判定と自己判定で SRS を二度動かさない）。
  const finalizeWriting = (qid: string, isCorrect: boolean, result: WritingJudgeResult, selfJudged: boolean) => {
    const isRetry = isRetryQuestion();
    if (!isRetry) {
      recordAnswer(qid, isCorrect).catch((e) => console.warn('[recordAnswer] failed:', e));
      updateSrsState(qid, isCorrect).catch((e) => console.warn('[updateSrsState] failed:', e));
    }
    // 記述の本文は answers 表に残るので、ここには判定だけ入れる
    logEvent({
      area: 'vocab', action: 'answer', targetType: 'word', targetId: qid,
      correct: isCorrect,
      format: currentMode === 'polysemy' ? 'context-writing' : 'meaning-writing', route: quizMode,
      ctx: {
        mode: currentMode, score: isCorrect ? 100 : 0, verdict: result.verdict, self: selfJudged,
        teacher: readChatTeacher(),
        ...(result.matchedQid ? { matched: result.matchedQid } : {}),
        ...(isRetry ? { retry: true } : {}),
      },
    });
    if (isRetry) return;
    if (isCorrect) {
      recordQuizTypeCorrect(qid, 'writing');
      // 多義語モードの記述 (context-writing) なら polysemy にもカウント
      if (currentMode === 'polysemy') recordQuizTypeCorrect(qid, 'polysemy');
    } else {
      addWrongAnswer(qid);
    }
  };

  const handleWritingSubmit = async (userAnswer: string, correctQid: string) => {
    if (!userAnswer.trim()) {
      showErrorMessage('回答を入力してください。');
      return;
    }
    const target = allWords.find(w => w.qid === correctQid);
    if (!target) return;

    const siblings = dataParser.getWordByLemma(target.lemma)?.meanings ?? [];
    const result = judgeWritingAnswer(userAnswer, target, siblings);
    setWritingResult(result);
    setCurrentWritingQid(correctQid);
    setWritingUserJudgment(undefined);
    setShowWritingResult(true);

    const isRetry = isRetryQuestion();
    if (result.verdict === 'correct') {
      finalizeWriting(correctQid, true, result, false);
      if (!isRetry) setScore(prev => prev + 1);
      // 正解でも自動では進まない。答え合わせの吹き出しを見せ、タップか「つぎへ」で次へ（2026-11-02）
      setNextButtonVisible(true);
    } else if (isDecided(result)) {
      // 別義・現代語・無回答は不正解で確定
      finalizeWriting(correctQid, false, result, false);
      setNextButtonVisible(true);
    }
    // 保留は自己判定を待つ。「つぎへ」は出さない（2026-11-06。状態遷移の見直し 案 B）。
    // 以前は保留でも「つぎへ」が出て、判定せずに進むとその回答は点にも箱にも記録されなかった。
    // 出口は吹き出しの「合っていた／ちがった」だけ。押すと handleWritingUserJudgment が記録して「つぎへ」を出す

    // 「もう一度」は直前に正解を見たあとの回答なので、正解の辞書の候補（answers 表）には入れない
    if (isRetry) return;

    // 回答の本文を保存（バックグラウンド、awaitしない）
    const anonId = localStorage.getItem('anonId') || `anon_${Date.now()}`;
    if (!localStorage.getItem('anonId')) {
      localStorage.setItem('anonId', anonId);
    }

    const sent: Promise<string | null> = fetch('/api/submitAnswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qid: correctQid,
        answerRaw: userAnswer,
        anonId,
        ...toAutoFields(result),
        questionType: 'writing',
      }),
    })
      .then(response => response.json())
      .then(data => {
        const id: string | null = typeof data?.answerId === 'string' && data.answerId ? data.answerId : null;
        // 次の問題へ進んだあとに届いた返事は、今の問題の印にしない
        if (id && writingAnswerIdRef.current === sent) setCurrentWritingAnswerId(id);
        return id;
      })
      .catch(e => {
        console.error('Failed to submit answer:', e);
        return null;
      });
    writingAnswerIdRef.current = sent;
  };

  // 自己判定は、機械で決まらなかった（保留の）回答にだけ受け付ける
  const handleWritingUserJudgment = async (judgment: boolean) => {
    if (writingResult.verdict !== 'pending' || writingUserJudgment !== undefined) return;
    setWritingUserJudgment(judgment);

    if (currentWritingQid) {
      finalizeWriting(currentWritingQid, judgment, writingResult, true);
      if (judgment && !isRetryQuestion()) setScore(prev => prev + 1);
    }

    // 自己判定を回答の行に残す（バックグラウンド）。answerId がまだ届いていなければ、届くのを待ってから送る
    const knownId = currentWritingAnswerId;
    const pendingId = writingAnswerIdRef.current;
    const anonId = localStorage.getItem('anonId');
    if (anonId && (knownId || pendingId)) {
      void (async () => {
        const answerId = knownId || (pendingId ? await pendingId : null);
        if (!answerId) return;
        fetch('/api/userCorrectAnswer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answerId,
            userCorrection: judgment ? 'OK' : 'NG',
            userId: anonId,
          }),
        }).catch(e => {
          console.error('Failed to submit user correction:', e);
        });
      })();
    }

    // 判定後も自動では進まない。selfRight / selfWrong の吹き出しを見せ、タップか「つぎへ」で次へ（2026-11-02）
    setNextButtonVisible(true);
  };

  // 多義語の記述（意味ごとに判定）。final が null の意味は保留のまま進んだもので、記録しない
  const handleContextWritingJudged = (
    results: Array<{ qid: string; result: WritingJudgeResult; final: boolean | null }>
  ) => {
    for (const r of results) {
      if (r.final === null) continue;
      finalizeWriting(r.qid, r.final, r.result, r.result.verdict === 'pending');
    }
    if (results.length > 0 && results.every(r => r.final === true)) {
      setScore(prev => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    // 最後の問題を終えたら、間違えた語を1回だけ「もう一度」として後ろに足す（lib/quiz/retryRound）
    if (
      currentMode === 'word' &&
      !retryAddedRef.current &&
      currentQuestionIndex + 1 >= currentQuizData.length &&
      wrongAnswers.length > 0
    ) {
      const retries = buildRetryRound(
        currentQuizData as QuizQuestion[],
        new Set(wrongAnswers.map((w) => w.qid)),
      );
      if (retries.length > 0) {
        retryAddedRef.current = true;
        setCurrentQuizData((prev) => [...(prev as QuizQuestion[]), ...retries]);
      }
    }
    setCurrentQuestionIndex(prev => prev + 1);
    setNextButtonVisible(false);
    setShowWritingResult(false);
    setWritingUserJudgment(undefined);
    setCurrentWritingAnswerId('');
    writingAnswerIdRef.current = null;
  };

  const handleExampleComprehensionCheck = async (answers: {[key: string]: string}) => {
    const currentWord = polysemyState.words[polysemyState.currentWordIndex];
    let correctCount = 0;

    // 各 meaning の正誤を判定し、word_stats / SRS / quiz_type_correct に per-qid で記録。
    // (元実装では記録漏れがあり、例文理解だけ累計に反映されなかった)
    // 対象は画面に出した意味だけ（例文の無い意味は出題していないので記録しない。
    // 条件は ExampleComprehensionContent と同じ quizMeanings）。
    const shownMeanings = quizMeanings(currentWord);
    for (const meaning of shownMeanings) {
      const userAnswer = answers[meaning.qid];
      const isCorrect = userAnswer === meaning.qid;
      if (isCorrect) correctCount++;
      recordAnswer(meaning.qid, isCorrect).catch((e) =>
        console.warn('[recordAnswer] failed:', e)
      );
      updateSrsState(meaning.qid, isCorrect).catch((e) =>
        console.warn('[updateSrsState] failed:', e)
      );
      logEvent({
        area: 'vocab', action: 'answer', targetType: 'word', targetId: meaning.qid,
        correct: isCorrect, chosen: userAnswer, format: 'example-comprehension', route: quizMode,
        ctx: { mode: currentMode, choices: currentWord.meanings.map((m) => m.qid) },
      });
      if (isCorrect) recordQuizTypeCorrect(meaning.qid, 'polysemy');
    }

    // 全問正解の場合のみスコア加算と○表示
    const isAllCorrect = shownMeanings.length > 0 && correctCount === shownMeanings.length;
    if (isAllCorrect) {
      setScore(prev => prev + 1);
      setShowCorrectCircle(true);
      setTimeout(() => {
        setShowCorrectCircle(false);
        // 最終問題なら index を進めず結果画面へ。それ以外は次の単語へ。
        // (進めると 6/5 のような表示になり、useEffect 終了判定が
        //  currentQuizData.length===0 で抜けるため終わらないバグの修正)
        const nextIdx = polysemyState.currentWordIndex + 1;
        if (nextIdx >= polysemyState.words.length) {
          setShowResults(true);
          setIsQuizActive(false);
        } else {
          setPolysemyState(prev => ({
            ...prev,
            currentWordIndex: nextIdx,
          }));
        }
      }, 500);
    }

    // 不正解がある場合は、ExampleComprehensionContent で「次へ」ボタンを表示
  };

  const handleExampleComprehensionNext = () => {
    const newWordIndex = polysemyState.currentWordIndex + 1;
    if (newWordIndex >= polysemyState.words.length) {
      setShowResults(true);
      setIsQuizActive(false);
      return;
    }
    setPolysemyState(prev => ({
      ...prev,
      currentWordIndex: newWordIndex
    }));
  };

  const handleContextWritingNext = () => {
    // 次の見出し語へ進む
    const newWordIndex = polysemyState.currentWordIndex + 1;
    if (newWordIndex >= polysemyState.words.length) {
      setShowResults(true);
      setIsQuizActive(false);
      return;
    }
    setPolysemyState(prev => ({
      ...prev,
      currentWordIndex: newWordIndex,
      currentExampleIndex: 0
    }));
    setShowWritingResult(false);
  };

  const restartQuiz = () => {
    setShowResults(false);
    setIsQuizActive(false);
    setupQuiz();
  };

  // 終わったあとの「次の範囲へ」（2026-11-13 ユーザー指示）。範囲を同じ幅で後ろへ送り、ふつうの単語クイズを始める。
  // 範囲が変わると出題を作り直す useEffect（wordRange が依存）が走るので、ここでは状態をそろえるだけ。ホームの「今日の分」も次からこの範囲になる
  const goNextWordRange = (next: { from: number; to: number }) => {
    setTodaySession(null);
    setQuizQidFilter(null);
    setQuizMode('normal');
    setCurrentMode('word');
    setShowResults(false);
    setIsQuizActive(false);
    setShowHome(false);
    setWordRange(next);
  };
  const nextRangeForEnd = currentMode === 'word' && quizMode !== 'weak' ? nextWordRange(wordRange) : null;

  // Range input completion handlers - 削除（自動遷移しない）

  // Check if quiz should end
  useEffect(() => {
    // Skip end check if quiz data is empty (happens during mode switching)
    if (currentQuizData.length === 0) return;

    if (isQuizActive && currentQuestionIndex >= currentQuizData.length) {
      if (currentMode === 'polysemy' && polysemyQuizType !== 'true-false') {
        if (polysemyQuizType === 'example-comprehension' && polysemyState.currentWordIndex >= polysemyState.words.length) {
          setShowResults(true);
          setIsQuizActive(false);
        }
        return;
      }
      setShowResults(true);
      setIsQuizActive(false);
    }
  }, [currentQuestionIndex, currentQuizData.length, isQuizActive, currentMode, polysemyQuizType, polysemyState.currentWordIndex, polysemyState.words.length]);

  const getCurrentQuestion = (): QuizQuestion | null => {
    if (currentMode === 'word' && currentQuestionIndex < currentQuizData.length) {
      return currentQuizData[currentQuestionIndex] as QuizQuestion;
    }
    return null;
  };

  const getCurrentTrueFalseQuestion = (): TrueFalseQuestion | null => {
    if (currentMode === 'polysemy' && polysemyQuizType === 'true-false' && currentQuestionIndex < currentQuizData.length) {
      return currentQuizData[currentQuestionIndex] as TrueFalseQuestion;
    }
    return null;
  };

  const getCurrentPolysemyWord = () => {
    if (currentMode === 'polysemy' && polysemyState.currentWordIndex < polysemyState.words.length) {
      return polysemyState.words[polysemyState.currentWordIndex];
    }
    return null;
  };

  const getProgress = () => {
    // 進捗 % 計算ヘルパ: 分母 0 で Infinity になるのを防ぐ + 表示は total を超えない
    const calc = (rawCurrent: number, total: number) => {
      if (total <= 0) return { current: 0, total: 0, percent: 0 };
      const current = Math.min(rawCurrent, total);
      return {
        current,
        total,
        percent: Math.round((current / total) * 100),
      };
    };
    if (currentMode === 'word') {
      return calc(currentQuestionIndex + 1, currentQuizData.length);
    } else if (currentMode === 'polysemy') {
      if (polysemyQuizType === 'true-false') {
        return calc(currentQuestionIndex + 1, currentQuizData.length);
      } else if (
        polysemyQuizType === 'example-comprehension' ||
        polysemyQuizType === 'context-writing'
      ) {
        return calc(polysemyState.currentWordIndex + 1, polysemyState.words.length);
      }
    }
    return { current: 1, total: 1, percent: 100 };
  };

  const getTotalScore = () => {
    if (currentMode === 'word') {
      // 最後の「もう一度」は採点に入れない
      return countScored(currentQuizData as QuizQuestion[]);
    } else if (currentMode === 'polysemy') {
      if (polysemyQuizType === 'example-comprehension') {
        // 加点は語ごと（全意味正解で +1。handleExampleComprehensionCheck）なので、分母も語の数
        return polysemyState.words.length;
      } else if (polysemyQuizType === 'context-writing') {
        return polysemyState.words.length; // 見出し語単位でカウント
      } else {
        return currentQuizData.length;
      }
    }
    return currentQuizData.length;
  };

  // Scroll to current range when opening index
  const indexListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showIndexModal && indexListRef.current) {
      const currentGroup = currentMode === 'word' ? wordRange.from : polysemyRange.from;
      if (currentGroup) {
        // Find the element with the current group number
        const targetElement = indexListRef.current.querySelector(`[data-group="${currentGroup}"]`);
        if (targetElement) {
          // Scroll to center the element
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [showIndexModal, currentMode, wordRange.from, polysemyRange.from]);

  // Determine the "current word" for contextual search
  const currentVisibleLemma = (() => {
    if (showWritingResult && currentWritingQid) {
      const l = lemmaOfQid(currentWritingQid);
      if (l) return l;
    }
    if (isQuizActive) {
      if (currentMode === 'word') {
        const q = getCurrentQuestion();
        // 見出し語が答えになる形式（空欄補充・意味→単語。おまかせで解決された場合も含む）は、
        // 答える前に検索ボタンへ語を出さない
        const qType = q?.resolvedType ?? wordQuizType;
        const lemmaIsAnswer = qType === 'blank-fill' || qType === 'word-reverse';
        if (lemmaIsAnswer && !nextButtonVisible) return '';
        if (q?.correct?.lemma) return q.correct.lemma;
      } else {
        const w = getCurrentPolysemyWord();
        if (w?.lemma) return w.lemma;
      }
    }
    return '';
  })();
  // Index button and modal (always visible)
  useEffect(() => { if (showHome) setReturnTo(null); }, [showHome]);

  const indexButton = (
    <>
      {/* Top-right fixed navigation - compact on mobile */}
      <QuizToolbar
        showHome={showHome}
        returnTo={returnTo}
        searchLemma={currentVisibleLemma}
        showTeacher={typeof window !== 'undefined' && hasAdminSession()}
        onReturn={(path) => navigate(path)}
        onHome={() => {
          setShowHome(true);
          setShowResults(false);
          setQuizQidFilter(null);
          setQuizMode('normal');
        }}
        onOpenTheme={() => setShowThemePicker(true)}
        onOpenIndex={() => setShowIndexModal(true)}
      />

      {/* Theme Picker (5色プリセット + カスタム) */}
      <ReiwaThemePicker open={showThemePicker} focus={themeFocus} onClose={() => { setShowThemePicker(false); setThemeFocus(null); }} />

      {/* Index Modal */}
      {showIndexModal && (
        <IndexModal
          words={filteredIndexWords}
          searchQuery={indexSearchQuery}
          onSearchChange={setIndexSearchQuery}
          onClose={() => setShowIndexModal(false)}
          listRef={indexListRef}
          onWordClick={(word) => {
            if (currentMode === 'word') {
              setWordRange({ from: word.group, to: word.group });
            } else {
              setPolysemyRange({ from: word.group, to: word.group });
            }
            setShowIndexModal(false);
            setIndexSearchQuery('');
            setShowResults(false);
            setIsQuizActive(false);
          }}
        />
      )}
    </>
  );

  if (isLoading) {
    return (
      <div className="bg-slate-50 min-h-screen">
        {indexButton}
        <div className="max-w-2xl mx-auto p-4 md:p-8">
          <div className="text-center p-16">データを読み込んでいます...</div>
        </div>
      </div>
    );
  }

  // Reiwa デザイン版ホーム画面 (showHome=true のとき)
  if (showHome && !showResults) {
    return (
      <div className="min-h-dvh bg-rw-bg">
        {indexButton}
        <div className="max-w-2xl mx-auto">
          <HomeReiwa
            currentMode={currentMode}
            wordRange={wordRange}
            polysemyRange={polysemyRange}
            weakWordsCount={weakWordsCount}
            dueWordsCount={dueWordsCount}
            dataError={homeDataError}
            welcomeBack={welcomeBack ? { gapDays: welcomeBack.gapDays, warmupCount: welcomeBack.warmup.length } : null}
            todayPreview={estimateToday(welcomeBack?.warmup.length ?? 0, todayDueCount)}
            quizRange={quizRange}
            onStartToday={() => void startTodaySession()}
            onStartQuizRange={(r) => {
              // 小テスト範囲を生徒の出題範囲にも反映（次からは指定不要）
              setWordRange({ from: r.from, to: r.to });
              void startTodaySession(false, { from: r.from, to: r.to });
            }}
            onStartReview={async () => {
              let weak: string[];
              try { weak = weakWordsOf(await loadLearningSnapshot(), allWords.map(w => w.qid)); }
              catch { setHomeDataError(true); return; }
              if (weak.length === 0) return;
              setQuizQidFilter(weak);
              setQuizMode('weak');
              setCurrentMode('word');
              setShowHome(false);
              void setupQuiz(weak, null, undefined, 'word');
            }}
            onSwitchMode={(mode) => {
              // モードも絞り込みも変わらないときは作り直しの useEffect が走らない。
              // 出題が空・結果画面のままなら、ここで作り直す（途中の出題はそのまま続ける）
              const unchanged = mode === currentMode && quizQidFilter == null;
              setQuizQidFilter(null);
              setQuizMode('normal');
              setCurrentMode(mode);
              setShowHome(false);
              if (unchanged && (currentQuizData.length === 0 || showResults)) {
                void setupQuiz(undefined, null, undefined, mode);
              }
            }}
            onOpenThemePicker={() => setShowThemePicker(true)}
            onOpenTeacherPicker={() => { setThemeFocus('teacher'); setShowThemePicker(true); }}
          />
        </div>
      </div>
    );
  }

  if (showResults) {
    return (
      <>
        {/* 間違えた語の 📖 で開く解説（結果画面でも出す） */}
        {vocabLemma && <VocabModal lemma={vocabLemma} onClose={() => setVocabLemma(null)} />}
        <QuizResultScreen
          header={indexButton}
          score={score}
          totalScore={getTotalScore()}
          currentMode={currentMode}
          quizMode={quizMode}
          todayGrowth={todayGrowth}
          wordRangeIsAll={wordRange.from === 1 && wordRange.to === 330}
          polysemyRangeIsAll={polysemyRange.from === 1 && polysemyRange.to === 330}
          wrongAnswers={wrongAnswers}
          cumulativeStats={cumulativeStats}
          returnTo={returnTo}
          nextRangeForEnd={nextRangeForEnd}
          hasExplanation={(lemma) => lemma in (bundledVocabIndex as Record<string, unknown>)}
          onReview={(qids) => {
            setQuizQidFilter(qids);
            setQuizMode('focus');
            setShowResults(false);
            setIsQuizActive(false);
            void setupQuiz(qids, null, undefined, 'word');
          }}
          onOpenVocab={setVocabLemma}
          onGoHome={() => {
            setShowHome(true);
            setShowResults(false);
            setIsQuizActive(false);
            setQuizQidFilter(null);
            setQuizMode('normal');
            if (quizMode === 'today') setTodaySession(null);
          }}
          onAnotherSet={() => void startTodaySession(true)}
          onNextRange={goNextWordRange}
          onRestart={restartQuiz}
          onNavigate={(path) => navigate(path)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: QUIZ_BACKGROUND_COLORS[quizBackgroundColor]?.bg ?? 'var(--rw-bg)' }}>
      {/* 和柄の背景（青海波／七宝。クイズ画面だけ）。固定の SVG を z 0 に敷き、中身は relative z-[1] で上に出す */}
      <QuizBackground pattern={quizBackground} color={quizBackgroundColor} />
      {vocabLemma && (
        <VocabModal lemma={vocabLemma} onClose={() => setVocabLemma(null)} />
      )}
      {indexButton}
      <div className="relative z-[1] max-w-2xl mx-auto p-3 md:p-6 pt-16 md:pt-6">
        {/* Feature shortcuts (shown only when no quiz in progress) */}
        {!isQuizActive && !showResults && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <a
              href="/search"
              className="flex items-center gap-2 bg-white rounded-xl p-3 shadow-sm border border-slate-200 hover:border-purple-300 hover:shadow transition no-underline"
              style={{ textDecoration: 'none' }}
            >
              <span style={{ fontSize: '1.4rem' }}>🔍</span>
              <div style={{ lineHeight: 1.2 }}>
                <div className="font-bold text-slate-800 text-sm">検索</div>
                <div className="text-xs text-slate-500">単語・例文・本文から探す</div>
              </div>
            </a>
            <a
              href="/read"
              className="flex items-center gap-2 bg-white rounded-xl p-3 shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow transition no-underline"
              style={{ textDecoration: 'none' }}
            >
              <span style={{ fontSize: '1.4rem' }}>📚</span>
              <div style={{ lineHeight: 1.2 }}>
                <div className="font-bold text-slate-800 text-sm">読解</div>
                <div className="text-xs text-slate-500">古文を読む</div>
              </div>
            </a>
          </div>
        )}

        {/* Mode Selection Tabs */}
        <QuizModeTabs
          current={currentMode}
          onSelect={(mode) => {
            if (currentMode === mode) return;
            const lemma = getCurrentLemma();
            setShowResults(false);
            if (lemma) setPendingSeedLemma(lemma);
            // 苦手復習などの絞り込みが残っていると、作り直しの useEffect が何もしない（出題が出ない）
            setQuizQidFilter(null);
            setQuizMode('normal');
            setCurrentMode(mode);
          }}
        />

        {/* Settings Area */}
        {/* カテゴリ絞り込み chips は非表示 (章範囲指定で代替)。
            CategoryFilterChips コンポーネント自体と URL ?category= ハンドラは
            残しているので、必要になったらここを再表示するだけで戻せる。 */}
        <div className="bg-rw-paper p-3 rounded-b-2xl shadow-sm border-x border-b border-rw-rule mb-2">
          {currentMode === 'word' ? (
            <QuizSettingsPanel
              key="word"
              typeOptions={WORD_TYPE_OPTIONS}
              quizType={wordQuizType}
              onQuizTypeChange={setWordQuizType}
              pickMode={pickMode}
              onPickModeChange={setPickMode}
              lastPickLine={lastPick ? compositionLine(lastPick) : null}
              numQuestions={wordNumQuestions}
              onNumQuestionsChange={setWordNumQuestions}
              defaultNumQuestions={10}
              range={wordRange}
              onRangeChange={handleWordRangeChange}
            />
          ) : (
            <QuizSettingsPanel
              key="polysemy"
              typeOptions={POLYSEMY_TYPE_OPTIONS}
              quizType={polysemyQuizType}
              onQuizTypeChange={setPolysemyQuizType}
              pickMode={pickMode}
              onPickModeChange={setPickMode}
              lastPickLine={lastPick ? compositionLine(lastPick) : null}
              numQuestions={polysemyNumQuestions}
              onNumQuestionsChange={setPolysemyNumQuestions}
              defaultNumQuestions={5}
              range={polysemyRange}
              onRangeChange={handlePolysemyRangeChange}
            />
          )}
        </div>


        {/* Correct Answer Circle（多義語の○×だけ。単語クイズは答え合わせの吹き出しに移り、ここは使わない） */}
        {showCorrectCircle && (
          <div className="flex justify-center mb-2">
            <div className="text-9xl text-red-500 font-black" style={{fontWeight: 900, WebkitTextStroke: '8px red'}}>
              ○
            </div>
          </div>
        )}

        {/* Quiz Content */}
        {isQuizActive && !showCorrectCircle && (
          // 出題・答え合わせは下敷きに載せる（和柄の上に直接文字が乗ると読みにくい。2026-11-02）
          <div
            className="relative rounded-2xl border border-rw-rule p-3 shadow-sm"
            // 白い紙だと眩しいので、背景の色を混ぜて少し沈める（2026-11-02 ユーザー指摘「下地が白だとやや眩しい」）
            style={{
              background: `color-mix(in srgb, color-mix(in srgb, ${QUIZ_BACKGROUND_COLORS[quizBackgroundColor]?.bg ?? 'var(--rw-bg)'} 65%, var(--rw-paper)) 92%, transparent)`,
            }}
          >
            {/* Word Mode Quiz */}
            {currentMode === 'word' && getCurrentQuestion() && (
              <WordQuizContent
                question={getCurrentQuestion()!}
                quizType={getCurrentQuestion()!.resolvedType ?? (wordQuizType === 'auto' ? 'word-meaning' : wordQuizType)}
                onAnswer={handleAnswer}
                onWritingSubmit={handleWritingSubmit}
                nextButtonVisible={nextButtonVisible}
                onNext={handleNextQuestion}
                showWritingResult={showWritingResult}
                writingResult={writingResult}
                writingUserJudgment={writingUserJudgment}
                handleWritingUserJudgment={handleWritingUserJudgment}
              />
            )}

            {/* Polysemy Mode Quiz */}
            {currentMode === 'polysemy' && (
              <>
                {polysemyQuizType === 'true-false' && getCurrentTrueFalseQuestion() && (
                  <TrueFalseQuizContent
                    question={getCurrentTrueFalseQuestion()!}
                    onAnswer={handleTrueFalseAnswer}
                    nextButtonVisible={nextButtonVisible}
                    onNext={handleNextQuestion}
                  />
                )}

                {polysemyQuizType === 'example-comprehension' && getCurrentPolysemyWord() && (
                  <ExampleComprehensionContent
                    word={getCurrentPolysemyWord()!}
                    onCheck={handleExampleComprehensionCheck}
                    onNext={handleExampleComprehensionNext}
                  />
                )}

                {polysemyQuizType === 'context-writing' && getCurrentPolysemyWord() && (
                  <ContextWritingContent
                    word={getCurrentPolysemyWord()!}
                    exampleIndex={polysemyState.currentExampleIndex}
                    onJudged={handleContextWritingJudged}
                    onNext={handleContextWritingNext}
                  />
                )}
              </>
            )}

            {/* 解説ボタン: 採点後 or 選択式で正解表示時に出す */}
            {(() => {
              const activeLemma = showWritingResult
                ? lemmaOfQid(currentWritingQid)
                : currentMode === 'word'
                ? getCurrentQuestion()?.correct?.lemma
                : getCurrentPolysemyWord()?.lemma;
              if (!activeLemma) return null;
              if (!showWritingResult && !nextButtonVisible) return null;
              const available = hasVocab(activeLemma);
              return (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button
                    className="vocab-open-btn"
                    disabled={!available}
                    onClick={() => available && setVocabLemma(activeLemma)}
                    title={available ? '単語の詳しい解説を開く' : 'この単語の解説は準備中です'}
                  >
                    📖 {activeLemma} の解説{available ? '' : '（準備中）'}
                  </button>
                </div>
              );
            })()}

            {/* Progress Bar */}
            <div className="mt-3 pt-2 border-t border-rw-rule">
              <div className="flex justify-between items-center mb-2 text-sm">
                <span className="font-bold text-rw-ink">
                  {getProgress().current}/{getProgress().total}
                </span>
                <span className="font-medium text-rw-ink-soft">
                  {getProgress().percent}%
                </span>
                <span className="text-xs text-rw-ink-soft">
                  スコア: {score}
                </span>
              </div>
              <div className="w-full rounded-full h-2.5" style={{ background: 'var(--rw-rule)' }}>
                <div
                  className="h-2.5 rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${getProgress().percent}%`, background: 'var(--rw-primary)' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-4 h-4 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="ml-3 text-red-500 hover:text-red-700 font-bold text-lg leading-none">&times;</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;// Cache bust 1761032804

// 単語帳カテゴリ絞り込み chips. 範囲指定とAND条件で動く。空 = 全カテゴリ。
const ALL_VOCAB_CATEGORIES = [
  '重要動詞',
  '重要形容詞',
  '重要副詞',
  '重要名詞',
  '敬語動詞',
  '多義語',
  '現古異義語',
  '接頭辞',
  '重要形容動詞',
];

function CategoryFilterChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const isAll = selected.length === 0;
  const toggle = (cat: string) => {
    if (selected.includes(cat)) {
      onChange(selected.filter((c) => c !== cat));
    } else {
      onChange([...selected, cat]);
    }
  };
  const clear = () => onChange([]);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-slate-600 font-bold">カテゴリ</span>
        <span className="text-[10px] text-slate-400">範囲とAND</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={clear}
          className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
          style={{
            background: isAll ? '#1e293b' : '#f1f5f9',
            color: isAll ? '#fff' : '#475569',
            border: `1px solid ${isAll ? '#1e293b' : '#cbd5e1'}`,
          }}
        >
          全て
        </button>
        {ALL_VOCAB_CATEGORIES.map((cat) => {
          const on = selected.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggle(cat)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: on ? '#1e293b' : '#f1f5f9',
                color: on ? '#fff' : '#475569',
                border: `1px solid ${on ? '#1e293b' : '#cbd5e1'}`,
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
