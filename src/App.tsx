import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { dataParser } from './utils/dataParser';
import { Word, MultiMeaningWord } from './types';
import RangeField from './components/RangeField';
import { useFullSelectInput } from './hooks/useFullSelectInput';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { buildSenseIndex } from './lib/buildSenseIndex';
import { matchSense, type LearnedCandidate } from './utils/matchSense';
import { WordQuizContent } from './components/quiz/WordQuizContent';
import { TrueFalseQuizContent } from './components/quiz/TrueFalseQuizContent';
import { ExampleComprehensionContent } from './components/quiz/ExampleComprehensionContent';
import { ContextWritingContent } from './components/quiz/ContextWritingContent';
import { recordAnswer } from './lib/wordStats';
import { updateSrsState } from './lib/srsEngine';
import VocabModal from './components/VocabModal';
import { IndexModal } from './components/IndexModal';
import { chapterFor, chapterColor } from './utils/chapters';
import bundledVocabIndex from './data/vocabIndex.json';
import { hasAdminSession } from './lib/adminSession';
import ReiwaThemePicker from './theme/ReiwaThemePicker';

type AppMode = 'word' | 'polysemy';
type WordQuizType = 'word-meaning' | 'word-reverse' | 'sentence-meaning' | 'meaning-writing';
type PolysemyQuizType = 'example-comprehension' | 'true-false' | 'context-writing';

interface QuizQuestion {
  correct: Word;
  options: Word[];
  exampleIndex?: number;
  exampleKobun?: string;
  exampleModern?: string;
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI refs for focus management
  const wordQuizTypeRef = useRef<HTMLSelectElement>(null);
  const polysemyQuizTypeRef = useRef<HTMLSelectElement>(null);

  // Full select inputs
  const fullSelectA = useFullSelectInput(); // wordNumQuestions 用
  const fullSelectB = useFullSelectInput(); // polysemyNumQuestions 用

  // Word mode settings with localStorage persistence
  const [wordQuizType, setWordQuizType] = useLocalStorageState<WordQuizType>('kobun-wordQuizType', 'word-meaning');
  const [wordNumQuestions, setWordNumQuestions] = useLocalStorageState<number>('kobun-wordNumQuestions', 10);
  const [wordRange, setWordRange] = useLocalStorageState<{from?: number; to?: number}>('kobun-wordRange', { from: 1, to: 50 });

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
  const [writingResult, setWritingResult] = useState<{score: number; feedback: string; reason?: string}>({ score: 0, feedback: '' });
  const [showCorrectCircle, setShowCorrectCircle] = useState(false);
  const [writingUserJudgment, setWritingUserJudgment] = useState<boolean | 'partial' | undefined>(undefined);
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

  // Wrong answers tracking for session-end review
  const [wrongAnswers, setWrongAnswers] = useState<Array<{ lemma: string; sense: string; qid: string }>>([]);

  // Index modal state
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<AppMode | null>(null);
  const [indexSearchQuery, setIndexSearchQuery] = useState('');

  // Polysemy mode state
  const [polysemyState, setPolysemyState] = useState<PolysemyState>({
    currentWordIndex: 0,
    currentExampleIndex: 0,
    words: [],
    userAnswers: [],
    quizType: 'example-comprehension'
  });

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

  // Build sense index for advanced matching
  const senseIndex = useMemo(() => {
    if (!Array.isArray(allWords) || allWords.length === 0) return new Map();
    return buildSenseIndex(allWords as any);
  }, [allWords]);

  // Learned candidates fetched from Firestore at runtime
  const [learnedCandidates, setLearnedCandidates] = useState<Record<string, LearnedCandidate[]>>({});
  useEffect(() => {
    fetch('/api/getAcceptedCandidates')
      .then(r => r.ok ? r.json() : {})
      .then(data => setLearnedCandidates(data))
      .catch(() => {}); // graceful fallback to empty
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // Initial quiz setup when data loads or settings change
  useEffect(() => {
    if (allWords.length > 0 && !isGeneratingQuiz) {
      let cancelled = false;

      const runSetup = async () => {
        setIsGeneratingQuiz(true);
        try {
          await setupQuiz();
        } finally {
          if (!cancelled) {
            setIsGeneratingQuiz(false);
          }
        }
      };

      runSetup();

      return () => {
        cancelled = true;
      };
    }
  }, [
    currentMode,
    wordQuizType, wordNumQuestions, wordRange.from, wordRange.to,
    polysemyQuizType, polysemyNumQuestions, polysemyRange.from, polysemyRange.to,
    allWords.length
  ]);


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

  const setupQuiz = async () => {
    // Reset all quiz states when switching modes
    setShowResults(false);
    setIsQuizActive(false);
    setCurrentQuestionIndex(0);
    setCurrentQuizData([]);
    setScore(0);
    setNextButtonVisible(false);
    setShowWritingResult(false);
    setShowCorrectCircle(false);
    setWrongAnswers([]);

    if (currentMode === 'word') {
      await setupWordQuiz();
    } else {
      setupPolysemyQuiz();
    }
  };

  const setupWordQuiz = async () => {
    const start = wordRange.from ?? 1;
    const end = wordRange.to ?? 330;
    const targetWords = allWords.filter(word =>
      word.group >= start && word.group <= end
    );

    // 記述式は1単語以上でOK、選択式も1単語以上（前後5単語から選択肢を選ぶ）
    if (targetWords.length < 1) {
      if (allWords.length > 0) {
        showErrorMessage('出題範囲に単語が見つかりません。');
      }
      return;
    }

    const quizData: QuizQuestion[] = [];
    const usedIndexes = new Set();
    const maxQuestions = new Set(targetWords.map(w => w.qid)).size;
    const actualNumQuestions = Math.min(wordNumQuestions, maxQuestions);

    // 重複回避用に最近使った選択肢を追跡
    const recentChoices = getRecentChoices();

    // 問題データを事前準備
    const questionPrepData = [];
    for (let i = 0; i < actualNumQuestions; i++) {
      let correctWordIndex;
      do {
        correctWordIndex = Math.floor(Math.random() * targetWords.length);
      } while (usedIndexes.has(targetWords[correctWordIndex].qid));

      usedIndexes.add(targetWords[correctWordIndex].qid);
      const correctWord = targetWords[correctWordIndex];

      // Get examples for the correct word (sense-priority)
      const multiMeaningWord = dataParser.getWordByLemma(correctWord.lemma);
      const examples = dataParser.getExamplesForSense(correctWord, correctWord.qid, multiMeaningWord);

      // Select a random example index if examples are available
      const exampleIndex = examples.kobun.length > 0 ? Math.floor(Math.random() * examples.kobun.length) : 0;
      const exampleKobun = examples.kobun[exampleIndex] || '';
      const exampleModern = examples.modern[exampleIndex] || '';

      questionPrepData.push({
        correctWord,
        exampleIndex,
        exampleKobun,
        exampleModern
      });
    }

    // 記述モード以外では選択肢をAPIから並列取得
    let apiChoices: (Word[] | null)[] = [];
    if (wordQuizType !== 'meaning-writing') {
      const apiPromises = questionPrepData.map(async (prep, idx) => {
        try {
          const excludeQids = [...Array.from(usedIndexes), ...recentChoices].join(',');
          const response = await fetch(
            `/api/getChoices?qid=${encodeURIComponent(prep.correctWord.qid)}&correctQid=${encodeURIComponent(prep.correctWord.qid)}&excludeQids=${excludeQids}&mode=${wordQuizType}`
          );

          if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length >= 4) {
              // 使った選択肢を記録
              data.choices.forEach((c: Word) => addRecentChoice(c.qid));
              return data.choices;
            }
          }
        } catch (e) {
          console.warn(`Failed to fetch choices for question ${idx}:`, e);
        }
        return null;
      });

      apiChoices = await Promise.all(apiPromises);
    }

    // 各問題を構築
    for (let i = 0; i < questionPrepData.length; i++) {
      const prep = questionPrepData[i];
      let options: Word[] = apiChoices[i] || [];

      // フォールバック：API が使えない場合は前後10単語から選択肢を生成（記述モード以外）
      if (wordQuizType !== 'meaning-writing' && options.length < 4) {
        const incorrectOptions: Word[] = [];
        const correctWord = prep.correctWord;

        // 前後10単語の範囲（group番号±10）
        const nearbyWords = allWords.filter(w =>
          Math.abs(w.group - correctWord.group) <= 10 && w.qid !== correctWord.qid
        );

        if (wordQuizType === 'sentence-meaning') {
          // Same word different meanings first (from nearby range)
          const sameWordMeanings = nearbyWords.filter(w =>
            w.lemma === correctWord.lemma
          );

          sameWordMeanings.forEach(meaning => {
            if (incorrectOptions.length < 2) {
              incorrectOptions.push(meaning);
            }
          });

          // Fill with other nearby words
          const shuffledNearby = [...nearbyWords].sort(() => Math.random() - 0.5);
          for (const word of shuffledNearby) {
            if (incorrectOptions.length >= 3) break;

            if (!word || !word.lemma || !word.sense) continue;

            if (word.sense !== correctWord.sense &&
                !incorrectOptions.some(opt => opt && opt.sense === word.sense) &&
                word.lemma !== correctWord.lemma) {
              incorrectOptions.push(word);
            }
          }

          // If still not enough, fall back to all words
          if (incorrectOptions.length < 3) {
            while (incorrectOptions.length < 3) {
              const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
              if (!randomWord || !randomWord.lemma || !randomWord.sense) continue;

              if (randomWord.sense !== correctWord.sense &&
                  !incorrectOptions.some(opt => opt && opt.sense === randomWord.sense) &&
                  randomWord.lemma !== correctWord.lemma) {
                incorrectOptions.push(randomWord);
              }
            }
          }
        } else {
          // word-meaning or word-reverse: use nearby words
          const shuffledNearby = [...nearbyWords].sort(() => Math.random() - 0.5);

          for (const word of shuffledNearby) {
            if (incorrectOptions.length >= 3) break;
            if (!word || !word.lemma || !word.sense) continue;

            if (wordQuizType === 'word-reverse') {
              if (word.lemma !== correctWord.lemma &&
                  !incorrectOptions.some(opt => opt && opt.lemma === word.lemma)) {
                incorrectOptions.push(word);
              }
            } else {
              if (word.sense !== correctWord.sense &&
                  !incorrectOptions.some(opt => opt && opt.sense === word.sense)) {
                incorrectOptions.push(word);
              }
            }
          }

          // If still not enough, fall back to all words
          if (incorrectOptions.length < 3) {
            while (incorrectOptions.length < 3) {
              const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
              if (!randomWord || !randomWord.lemma || !randomWord.sense) continue;

              if (wordQuizType === 'word-reverse') {
                if (randomWord.lemma !== correctWord.lemma &&
                    !incorrectOptions.some(opt => opt && opt.lemma === randomWord.lemma)) {
                  incorrectOptions.push(randomWord);
                }
              } else {
                if (randomWord.sense !== correctWord.sense &&
                    !incorrectOptions.some(opt => opt && opt.sense === randomWord.sense)) {
                  incorrectOptions.push(randomWord);
                }
              }
            }
          }
        }

        options = [correctWord, ...incorrectOptions].sort(() => Math.random() - 0.5);
      }

      quizData.push({
        correct: prep.correctWord,
        options,
        exampleIndex: prep.exampleIndex,
        exampleKobun: dataParser.getEmphasizedExample(prep.exampleKobun, prep.correctWord.lemma),
        exampleModern: prep.exampleModern
      });
    }

    setCurrentQuizData(quizData);
    setCurrentQuestionIndex(0);
    setScore(0);
    setIsQuizActive(true);
    setShowResults(false);
    setNextButtonVisible(false);
    setShowWritingResult(false);
  };

  const setupPolysemyQuiz = () => {
    const start = polysemyRange.from ?? 1;
    const end = polysemyRange.to ?? 330;
    const polysemyWords = getPolysemyWords(allWords, start, end);

    if (polysemyWords.length === 0) {
      if (allWords.length > 0) {
        showErrorMessage('指定された範囲に多義語が見つかりません。');
      }
      return;
    }

    // シャッフルしてから選択
    const shuffled = [...polysemyWords].sort(() => Math.random() - 0.5);
    const selectedWords = shuffled.slice(0, Math.min(polysemyNumQuestions, polysemyWords.length));

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
    setIsQuizActive(true);
    setShowResults(false);
    setNextButtonVisible(false);
    setShowWritingResult(false);
  };

  const setupTrueFalseQuiz = (words: MultiMeaningWord[]) => {
    const questions: TrueFalseQuestion[] = [];
    const numQuestions = words.length * 3;

    for (let i = 0; i < numQuestions; i++) {
      const wordGroup = words[i % words.length];
      const isCorrect = Math.random() < 0.5;

      if (isCorrect) {
        const correctMeaning = wordGroup.meanings[Math.floor(Math.random() * wordGroup.meanings.length)];

        // Get examples for the correct meaning (sense-priority)
        const examples = dataParser.getExamplesForSense(correctMeaning, correctMeaning.qid, wordGroup);
        const exampleIndex = examples.kobun.length > 0 ? Math.floor(Math.random() * examples.kobun.length) : 0;

        questions.push({
          example: correctMeaning.examples[0].jp,
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
        let wrongMeaning: Word;

        if (Math.random() < 0.5 && wordGroup.meanings.length > 1) {
          do {
            wrongMeaning = wordGroup.meanings[Math.floor(Math.random() * wordGroup.meanings.length)];
          } while (wrongMeaning.qid === randomExample.qid);
        } else {
          wrongMeaning = allWords[Math.floor(Math.random() * allWords.length)];
          while (wrongMeaning && wrongMeaning.lemma === wordGroup.lemma) {
            wrongMeaning = allWords[Math.floor(Math.random() * allWords.length)];
            // Prevent infinite loop if no valid words are found
            if (!wrongMeaning || !wrongMeaning.lemma) {
              break;
            }
          }
        }

        // Get examples for the random example (sense-priority)
        const examples = dataParser.getExamplesForSense(randomExample, randomExample.qid, wordGroup);
        const exampleIndex = examples.kobun.length > 0 ? Math.floor(Math.random() * examples.kobun.length) : 0;

        questions.push({
          example: randomExample.examples[0].jp,
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

    setCurrentQuizData(questions.sort(() => Math.random() - 0.5));
  };

  const evaluateWritingAnswer = (userAnswer: string, correctQid: string) => {
    const candidates = senseIndex.get(correctQid) ?? [];
    const learned = learnedCandidates[correctQid] ?? [];
    const result = matchSense(userAnswer, candidates, learned);

    // matchSense.ts の新しいスコアシステムを使用
    const scoreToFeedback: Record<number, string> = {
      100: '完全一致！',
      90: 'ほぼ正解（語幹のみ一致）',
      85: '接続部分（〜て、〜で）のみ訳し忘れ',
      75: '余分な意味を付け加えています',
      70: '活用形の違い',
      65: '必須要素が欠落しています',
      60: '意味的に近い',
      0: '意味が異なります'
    };

    if (result.ok && result.score >= 60) {
      const feedback = scoreToFeedback[result.score] || `${result.score}% - ${result.detail || ''}`;
      return {
        score: result.score,
        feedback: feedback,
        reason: result.reason,
        detail: result.detail
      };
    }

    return {
      score: 0,
      feedback: scoreToFeedback[0],
      reason: result.reason,
      detail: result.detail
    };
  };

  const handleAnswer = (selectedOption: Word, correctOption: Word, isReverse = false) => {
    const isCorrect = selectedOption.qid === correctOption.qid;
    // Track word stats and SRS in Supabase (fire-and-forget)
    recordAnswer(correctOption.qid, isCorrect).catch(() => {});
    updateSrsState(correctOption.qid, isCorrect).catch(() => {});
    if (isCorrect) {
      setScore(prev => prev + 1);
      setShowCorrectCircle(true);
      setTimeout(() => {
        setShowCorrectCircle(false);
        setCurrentQuestionIndex(prev => prev + 1);
        setNextButtonVisible(false);
      }, 500);
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
    recordAnswer(question.correctAnswer.qid, isCorrect).catch(() => {});
    updateSrsState(question.correctAnswer.qid, isCorrect).catch(() => {});
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

  const handleWritingSubmit = async (userAnswer: string, correctQid: string) => {
    if (!userAnswer.trim()) {
      showErrorMessage('回答を入力してください。');
      return;
    }

    const evaluation = evaluateWritingAnswer(userAnswer, correctQid);
    setWritingResult(evaluation);
    setCurrentWritingQid(correctQid);
    setWritingUserJudgment(undefined);

    // Track word stats and SRS in Supabase (fire-and-forget)
    recordAnswer(correctQid, evaluation.score >= 60).catch(() => {});
    updateSrsState(correctQid, evaluation.score >= 60).catch(() => {});

    // スコア更新と結果表示（即座に）
    // 60点以上で正解扱い（手動判定で変更可能）
    if (evaluation.score >= 60) {
      setScore(prev => prev + 1);
    } else {
      // 不正解を記録（セッション末復習用）
      const correctWord = allWords.find(w => w.qid === correctQid);
      if (correctWord) {
        setWrongAnswers(prev => {
          if (prev.some(w => w.qid === correctQid)) return prev;
          return [...prev, { lemma: correctWord.lemma, sense: correctWord.sense, qid: correctQid }];
        });
      }
    }
    setShowWritingResult(true);

    // 100点（完全正解）の場合は自動遷移、それ以外は次へボタン表示
    if (evaluation.score === 100) {
      setTimeout(() => {
        handleNextQuestion();
      }, 1500);
    } else {
      setNextButtonVisible(true);
    }

    // Save to Firestore（バックグラウンド、awaitしない）
    const anonId = localStorage.getItem('anonId') || `anon_${Date.now()}`;
    if (!localStorage.getItem('anonId')) {
      localStorage.setItem('anonId', anonId);
    }

    fetch('/api/submitAnswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qid: correctQid,
        answerRaw: userAnswer,
        anonId,
        autoScore: evaluation.score,
        autoResult: evaluation.score >= 60 ? 'OK' : 'NG',
        autoReason: evaluation.feedback,
        questionType: 'writing',
      }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.answerId) {
          setCurrentWritingAnswerId(data.answerId);
        }
      })
      .catch(e => {
        console.error('Failed to submit answer:', e);
      });
  };

  const handleWritingUserJudgment = async (judgment: boolean | 'partial') => {
    setWritingUserJudgment(judgment);
    setNextButtonVisible(false); // 次へボタンを非表示

    // Update score based on user judgment (○表示なし)
    if (judgment === true && writingResult.score < 60) {
      // User says correct but auto said wrong
      setScore(prev => prev + 1);
    } else if (judgment === false && writingResult.score >= 60) {
      // User says wrong but auto said correct
      setScore(prev => Math.max(0, prev - 1));
    }
    // judgment === 'partial' の場合はスコアを変更しない

    // Override SRS with manual judgment (fire-and-forget)
    // partial は自動評価のまま据え置く
    if (currentWritingQid && judgment !== 'partial') {
      updateSrsState(currentWritingQid, judgment === true).catch(() => {});
    }

    // Save to Firestore（バックグラウンド）- answerIdがあれば保存
    if (currentWritingAnswerId) {
      const anonId = localStorage.getItem('anonId');
      if (anonId) {
        const userCorrectionValue = judgment === true ? 'OK' : judgment === 'partial' ? 'PARTIAL' : 'NG';
        fetch('/api/userCorrectAnswer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answerId: currentWritingAnswerId,
            userCorrection: userCorrectionValue,
            userId: anonId,
          }),
        }).catch(e => {
          console.error('Failed to submit user correction:', e);
        });
      }
    }

    // 判定後0.6秒で自動遷移（常に実行）
    setTimeout(() => {
      handleNextQuestion();
    }, 600);
  };

  const handleNextQuestion = () => {
    setCurrentQuestionIndex(prev => prev + 1);
    setNextButtonVisible(false);
    setShowWritingResult(false);
    setWritingUserJudgment(undefined);
    setCurrentWritingAnswerId('');
  };

  const handleExampleComprehensionCheck = async (answers: {[key: string]: string}) => {
    const currentWord = polysemyState.words[polysemyState.currentWordIndex];
    let correctCount = 0;

    // 正誤判定
    for (const meaning of currentWord.meanings) {
      const userAnswer = answers[meaning.qid];
      const isCorrect = userAnswer === meaning.qid;
      if (isCorrect) correctCount++;
    }

    // 全問正解の場合のみスコア加算と○表示
    const isAllCorrect = correctCount === currentWord.meanings.length;
    if (isAllCorrect) {
      setScore(prev => prev + 1);
      // 全問正解時は●を表示
      setShowCorrectCircle(true);
      // 0.5秒後に遷移（○は遷移時に自動的に消える）
      setTimeout(() => {
        setPolysemyState(prev => ({
          ...prev,
          currentWordIndex: prev.currentWordIndex + 1
        }));
        setShowCorrectCircle(false);
      }, 500);
    }

    // 例文理解モードはFirestoreに保存しない（選択式なので記述データではない）
    // 不正解がある場合は、ExampleComprehensionContentで「次へ」ボタンを表示
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
    if (currentMode === 'word') {
      return {
        current: currentQuestionIndex + 1,
        total: currentQuizData.length,
        percent: Math.round(((currentQuestionIndex + 1) / currentQuizData.length) * 100)
      };
    } else if (currentMode === 'polysemy') {
      if (polysemyQuizType === 'true-false') {
        return {
          current: currentQuestionIndex + 1,
          total: currentQuizData.length,
          percent: Math.round(((currentQuestionIndex + 1) / currentQuizData.length) * 100)
        };
      } else if (polysemyQuizType === 'example-comprehension') {
        return {
          current: polysemyState.currentWordIndex + 1,
          total: polysemyState.words.length,
          percent: Math.round(((polysemyState.currentWordIndex + 1) / polysemyState.words.length) * 100)
        };
      } else if (polysemyQuizType === 'context-writing') {
        return {
          current: polysemyState.currentWordIndex + 1,
          total: polysemyState.words.length,
          percent: Math.round(((polysemyState.currentWordIndex + 1) / polysemyState.words.length) * 100)
        };
      }
    }
    return { current: 1, total: 1, percent: 100 };
  };

  const getTotalScore = () => {
    if (currentMode === 'word') {
      return currentQuizData.length;
    } else if (currentMode === 'polysemy') {
      if (polysemyQuizType === 'example-comprehension') {
        return polysemyState.words.reduce((sum, word) => sum + word.meanings.length, 0);
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
        if (q?.correct?.lemma) return q.correct.lemma;
      } else {
        const w = getCurrentPolysemyWord();
        if (w?.lemma) return w.lemma;
      }
    }
    return '';
  })();
  const searchHref = currentVisibleLemma
    ? `/search?q=${encodeURIComponent(currentVisibleLemma)}`
    : '/search';

  // Index button and modal (always visible)
  const indexButton = (
    <>
      {/* Top-right fixed navigation - compact on mobile */}
      <div className="fixed top-2 right-2 z-50 flex gap-1.5">
        <button
          onClick={() => setShowThemePicker(true)}
          className="bg-rw-primary hover:opacity-90 text-rw-paper font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
          title="テーマ設定 (5色プリセット + カスタム)"
        >
          🎨<span className="hidden sm:inline ml-1">テーマ</span>
        </button>
        <a
          href={searchHref}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
          title={currentVisibleLemma ? `「${currentVisibleLemma}」を検索` : '単語・例文・教材を検索'}
        >
          🔍<span className="ml-1">
            {currentVisibleLemma ? `「${currentVisibleLemma}」` : '検索'}
          </span>
        </a>
        <a
          href="/read"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
          title="古文読み（読解モード）"
        >
          📚<span className="hidden sm:inline ml-1">読解</span>
        </a>
        <button
          onClick={() => setShowIndexModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
        >
          索引
        </button>
        {typeof window !== 'undefined' && hasAdminSession() && (
          <a
            href="/teacher"
            className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
            title="教員管理画面(回答一覧・誤答分析・教材公開管理)"
          >
            🛠<span className="hidden sm:inline ml-1">教員</span>
          </a>
        )}
      </div>

      {/* Theme Picker (5色プリセット + カスタム) */}
      <ReiwaThemePicker open={showThemePicker} onClose={() => setShowThemePicker(false)} />

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

  if (showResults) {
    const totalScore = getTotalScore();
    const percent = totalScore > 0 ? Math.round((score / totalScore) * 100) : 0;
    const isPerfectScore = score === totalScore && totalScore > 0;
    const showGinkgoAnimation = isPerfectScore && totalScore >= 20;

    // 単語王：330問完全制覇（範囲1-330）
    const isMasterAchievement = isPerfectScore && totalScore === 330 &&
      (wordRange.from === 1 && wordRange.to === 330);

    // 単語最強王：多義語モード196問完全制覇（範囲1-330）
    const isUltimateMasterAchievement = isPerfectScore && totalScore === 196 &&
      (polysemyRange.from === 1 && polysemyRange.to === 330);

    return (
      <div className="bg-slate-50 min-h-screen relative overflow-hidden">
        {indexButton}
        {/* 銀杏の葉アニメーション */}
        {showGinkgoAnimation && (
          <div className="ginkgo-container">
            {[...Array(15)].map((_, i) => (
              <div
                key={i}
                className="ginkgo-leaf"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${4 + Math.random() * 2}s`
                }}
              >
                🍂
              </div>
            ))}
            <style>{`
              .ginkgo-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 50;
              }
              .ginkgo-leaf {
                position: absolute;
                top: -50px;
                font-size: 2rem;
                animation: fall linear infinite;
              }
              @keyframes fall {
                0% {
                  transform: translateY(0) rotate(0deg);
                  opacity: 1;
                }
                100% {
                  transform: translateY(100vh) rotate(360deg);
                  opacity: 0.3;
                }
              }
            `}</style>
          </div>
        )}

        <div className="max-w-2xl mx-auto p-4 md:p-8 relative z-10">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <h1 className="text-2xl font-bold text-slate-800 mb-4">クイズ終了！</h1>
            <p className="text-slate-600 text-lg mb-4">お疲れ様でした。</p>

            {/* Perfect Score Celebration */}
            {isPerfectScore && (
              <div className="mb-4">
                {isUltimateMasterAchievement ? (
                  <>
                    <div className="text-9xl font-bold mb-4 animate-pulse" style={{
                      background: 'linear-gradient(45deg, #FF0000, #FF4500, #FF0000)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      textShadow: '0 0 30px rgba(255, 0, 0, 0.5)'
                    }}>
                      🔥👑🔥
                    </div>
                    <p className="text-6xl font-black mb-4" style={{
                      background: 'linear-gradient(45deg, #FF0000, #FF4500, #FF6347)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '0.1em'
                    }}>
                      単語最強王
                    </p>
                    <p className="text-2xl font-bold text-red-600 mb-2">全196問完全制覇！</p>
                    <p className="text-lg text-slate-700">あなたは最強の単語マスターです！</p>
                  </>
                ) : isMasterAchievement ? (
                  <>
                    <div className="text-9xl font-bold mb-4 animate-pulse" style={{
                      background: 'linear-gradient(45deg, #FFD700, #FFA500, #FFD700)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      textShadow: '0 0 30px rgba(255, 215, 0, 0.5)'
                    }}>
                      👑
                    </div>
                    <p className="text-6xl font-black mb-4" style={{
                      background: 'linear-gradient(45deg, #FFD700, #FFA500, #FF8C00)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '0.1em'
                    }}>
                      単語王
                    </p>
                    <p className="text-2xl font-bold text-amber-600 mb-2">全330問完全制覇！</p>
                    <p className="text-lg text-slate-700">あなたは真の単語マスターです！</p>
                  </>
                ) : (
                  <>
                    <div className="text-8xl text-red-500 font-bold mb-2 animate-bounce">
                      ○
                    </div>
                    <p className="text-xl font-bold text-red-500 mb-2">パーフェクト！</p>
                    <p className="text-lg text-slate-700">すべて正解です！素晴らしい！</p>
                    {showGinkgoAnimation && (
                      <p className="text-md text-amber-600 mt-2">🍂 銀杏の葉が舞っています 🍂</p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mb-8">
              <p className={`text-5xl font-bold ${isPerfectScore ? 'text-red-500' : 'text-blue-500'}`}>
                <span>{score}</span> / <span>{totalScore}</span>
              </p>
              <p className="text-slate-500 mt-1">正解率 {percent}%</p>
            </div>

            {/* 間違えた単語の復習リスト */}
            {wrongAnswers.length > 0 && (
              <div className="mb-6 text-left">
                <h3 className="text-sm font-bold text-slate-600 mb-2">間違えた単語（{wrongAnswers.length}語）</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {wrongAnswers.map(w => (
                    <div key={w.qid} className="flex items-baseline gap-2 px-3 py-1.5 bg-red-50 rounded text-sm">
                      <span className="font-bold text-slate-800">{w.lemma}</span>
                      <span className="text-slate-600">{w.sense}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={restartQuiz}
                className={`w-full font-bold py-4 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 ${
                  isPerfectScore
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                同じ範囲を繰り返す
              </button>
              <button
                onClick={() => {
                  setShowResults(false);
                  setIsQuizActive(false);
                }}
                className="w-full font-bold py-4 px-4 rounded-lg shadow-md bg-slate-600 hover:bg-slate-700 text-white transition-colors"
              >
                設定に戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      {vocabLemma && (
        <VocabModal lemma={vocabLemma} onClose={() => setVocabLemma(null)} />
      )}
      {indexButton}
      <div className="max-w-2xl mx-auto p-3 md:p-6 pt-16 md:pt-6">
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
        <div className="flex justify-center border-b border-slate-200 mb-4 bg-white rounded-t-2xl shadow-sm">
          <button
            onClick={() => {
              if (isQuizActive && currentMode !== 'word') {
                setPendingModeSwitch('word');
              } else {
                setShowResults(false);
                setCurrentMode('word');
              }
            }}
            className={`mode-tab ${currentMode === 'word' ? 'active-tab' : ''}`}
            style={{
              padding: '0.75rem 1.5rem',
              fontWeight: 600,
              color: currentMode === 'word' ? '#3b82f6' : '#64748b',
              borderBottom: currentMode === 'word' ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.2s ease-in-out',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            単語モード
          </button>
          <button
            onClick={() => {
              if (isQuizActive && currentMode !== 'polysemy') {
                setPendingModeSwitch('polysemy');
              } else {
                setShowResults(false);
                setCurrentMode('polysemy');
              }
            }}
            className={`mode-tab ${currentMode === 'polysemy' ? 'active-tab' : ''}`}
            style={{
              padding: '0.75rem 1.5rem',
              fontWeight: 600,
              color: currentMode === 'polysemy' ? '#3b82f6' : '#64748b',
              borderBottom: currentMode === 'polysemy' ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.2s ease-in-out',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            多義語モード
          </button>
        </div>

        {/* Mode Switch Confirmation */}
        {pendingModeSwitch && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-lg p-3 mb-2 text-sm">
            <span className="text-amber-800">
              モードを切り替えると、進行中のクイズがリセットされます。
            </span>
            <div className="flex gap-2 ml-4 shrink-0">
              <button
                onClick={() => {
                  setShowResults(false);
                  setCurrentMode(pendingModeSwitch);
                  setPendingModeSwitch(null);
                }}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded transition"
              >
                切り替える
              </button>
              <button
                onClick={() => setPendingModeSwitch(null)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Settings Area */}
        <div className="bg-white p-3 rounded-b-2xl shadow-sm border-x border-b border-slate-200 mb-2">
          {currentMode === 'word' ? (
            <div className="grid grid-cols-2 gap-2">
              {/* 左列: モードと問題数 */}
              <div className="space-y-2">
                <div>
                  <select
                    ref={wordQuizTypeRef}
                    value={wordQuizType}
                    onChange={(e) => setWordQuizType(e.target.value as WordQuizType)}
                    className="w-full p-1 bg-slate-100 border border-slate-200 rounded text-xs"
                  >
                    <option value="word-meaning">単語の意味を選ぶ</option>
                    <option value="word-reverse">意味から単語を選ぶ</option>
                    <option value="sentence-meaning">例文から意味を選ぶ</option>
                    <option value="meaning-writing">意味を書いて答える</option>
                  </select>
                </div>
                <div className="flex items-center space-x-1">
                  <label className="text-xs text-slate-600 whitespace-nowrap">問題数</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    autoCorrect="off"
                    enterKeyHint="done"
                    value={wordNumQuestions}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return;
                      const n = parseInt(v, 10);
                      if (!Number.isNaN(n)) setWordNumQuestions(Math.max(1, Math.min(330, n)));
                    }}
                    onBlur={(e) => {
                      if (e.target.value === "" || Number.isNaN(parseInt(e.target.value, 10))) {
                        setWordNumQuestions(10);
                      }
                    }}
                    {...fullSelectA}
                    onWheel={(e) => e.preventDefault()}
                    min="1"
                    max="330"
                    placeholder="数"
                    className="w-14 p-1 bg-slate-100 border border-slate-200 rounded text-center text-base"
                    style={{
                      MozAppearance: 'textfield',
                      WebkitAppearance: 'none'
                    }}
                  />
                </div>
              </div>
              {/* 右列: 範囲選択 */}
              <div>
                <RangeField
                  value={wordRange}
                  onChange={handleWordRangeChange}
                  min={1}
                  max={330}
                />
              </div>
            </div>
          ) : null}

          {currentMode !== 'word' && (
            <div className="grid grid-cols-2 gap-2">
              {/* 左列: モードと問題数 */}
              <div className="space-y-2">
                <div>
                  <select
                    ref={polysemyQuizTypeRef}
                    value={polysemyQuizType}
                    onChange={(e) => setPolysemyQuizType(e.target.value as PolysemyQuizType)}
                    className="w-full p-1 bg-slate-100 border border-slate-200 rounded text-xs"
                  >
                    <option value="example-comprehension">例文と意味を結びつける</option>
                    <option value="true-false">例文の訳の正誤を判断</option>
                    <option value="context-writing">文脈から意味を書く</option>
                  </select>
                </div>
                <div className="flex items-center space-x-1">
                  <label className="text-xs text-slate-600 whitespace-nowrap">問題数</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    autoCorrect="off"
                    enterKeyHint="done"
                    value={polysemyNumQuestions}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return;
                      const n = parseInt(v, 10);
                      if (!Number.isNaN(n)) setPolysemyNumQuestions(Math.max(1, Math.min(330, n)));
                    }}
                    onBlur={(e) => {
                      if (e.target.value === "" || Number.isNaN(parseInt(e.target.value, 10))) {
                        setPolysemyNumQuestions(5);
                      }
                    }}
                    {...fullSelectB}
                    onWheel={(e) => e.preventDefault()}
                    min="1"
                    max="330"
                    placeholder="数"
                    className="w-14 p-1 bg-slate-100 border border-slate-200 rounded text-center text-base"
                    style={{
                      MozAppearance: 'textfield',
                      WebkitAppearance: 'none'
                    }}
                  />
                </div>
              </div>
              {/* 右列: 範囲選択 */}
              <div>
                <RangeField
                  value={polysemyRange}
                  onChange={handlePolysemyRangeChange}
                  min={1}
                  max={330}
                />
              </div>
            </div>
          )}
        </div>


        {/* Correct Answer Circle */}
        {showCorrectCircle && (
          <div className="flex justify-center mb-2">
            <div className="text-9xl text-red-500 font-black" style={{fontWeight: 900, WebkitTextStroke: '8px red'}}>
              ○
            </div>
          </div>
        )}

        {/* Quiz Content */}
        {isQuizActive && !showCorrectCircle && (
          <div className="relative">
            {/* Word Mode Quiz */}
            {currentMode === 'word' && getCurrentQuestion() && (
              <WordQuizContent
                question={getCurrentQuestion()!}
                quizType={wordQuizType}
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
                    onWritingSubmit={handleWritingSubmit}
                    onNext={handleContextWritingNext}
                    showWritingResult={showWritingResult}
                    writingResult={writingResult}
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
            <div className="mt-3 pt-2 border-t border-slate-200">
              <div className="flex justify-between items-center mb-2 text-sm">
                <span className="font-bold text-slate-700">
                  {getProgress().current}/{getProgress().total}
                </span>
                <span className="font-medium text-slate-500">
                  {getProgress().percent}%
                </span>
                <span className="text-xs text-slate-400">
                  スコア: {score}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${getProgress().percent}%` }}
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
