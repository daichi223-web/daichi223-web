import React, { useState } from 'react';
import { Word } from '../../types';
import ExampleDisplay from '../ExampleDisplay';
import { MarkedSentence } from './MarkedSentence';
import { WordInsightPanel, WordInsightStrip } from './WordInsightPanel';
import { answerTone, stripSenseBrackets } from './writingVerdict';
import { resolveTargetSpans } from '../../lib/targetMark';

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

export interface TrueFalseQuizContentProps {
  question: TrueFalseQuestion;
  onAnswer: (answer: boolean) => void;
  nextButtonVisible: boolean;
  onNext: () => void;
}

export function TrueFalseQuizContent({ question, onAnswer, nextButtonVisible, onNext }: TrueFalseQuizContentProps) {
  const [answered, setAnswered] = useState(false);
  const [answeredCorrectly, setAnsweredCorrectly] = useState<boolean | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);

  // Reset state when question changes
  React.useEffect(() => {
    setAnswered(false);
    setAnsweredCorrectly(null);
    setSelectedAnswer(null);
  }, [question.example, question.meaning]);

  // 正解時に自動遷移。核イメージがある語は1行だけ「学びの瞬間」を見せてから進む。
  React.useEffect(() => {
    if (answeredCorrectly === true && onNext) {
      const hasInsight = !!(question.correctAnswer?.senseCore || question.correctAnswer?.trap);
      const timer = setTimeout(() => {
        onNext();
      }, hasInsight ? 1600 : 500);
      return () => clearTimeout(timer);
    }
  }, [answeredCorrectly, onNext, question.correctAnswer]);

  const handleAnswer = (answer: boolean) => {
    if (answered) return;
    setAnswered(true);
    setSelectedAnswer(answer);
    const isCorrect = answer === question.isCorrect;
    setAnsweredCorrectly(isCorrect);
    onAnswer(answer);
  };

  // ボタンのスタイル決定。答えた後は、薄い地＋濃い文字＋太い枠で示す。
  // ボタンの文言そのものが ○・× なので、正誤は記号ではなく「正解」「不正解」の語で添える。
  const base = 'flex-1 font-black py-4 px-6 rounded-xl transition border-2 text-lg tracking-widest';
  const buttonState = (value: boolean): 'idle' | 'correct' | 'wrong' | 'rest' => {
    if (!answered) return 'idle';
    if (value === question.isCorrect) return 'correct'; // こちらが正しい答え
    return selectedAnswer === value ? 'wrong' : 'rest'; // 選んだ誤答／選ばなかった誤答
  };
  const buttonClass = (value: boolean) => {
    const state = buttonState(value);
    if (state === 'idle') {
      return `${base} bg-rw-paper border-rw-rule text-rw-ink ${value ? 'hover:border-rw-accent' : 'hover:border-rw-primary'}`;
    }
    if (state === 'rest') return `${base} bg-rw-paper border-rw-rule text-rw-ink-soft pointer-events-none`;
    return `${base} text-rw-ink pointer-events-none`;
  };
  const buttonTone = (value: boolean): React.CSSProperties | undefined => {
    const state = buttonState(value);
    if (state === 'correct') return answerTone('var(--rw-accent)');
    if (state === 'wrong') return answerTone('var(--rw-primary)');
    return undefined;
  };
  const buttonTag = (value: boolean) => {
    const state = buttonState(value);
    if (state !== 'correct' && state !== 'wrong') return null;
    return (
      <span className="block text-xs tracking-wider mt-1">
        {state === 'correct' ? '正解' : '不正解'}
      </span>
    );
  };

  // 例文に印が付いているか（付かない例文では、指示文に見出し語を入れる）
  const sentence = question.exampleKobun || question.example;
  const isMarked = !!sentence && resolveTargetSpans(sentence, question.correctAnswer).spans.length > 0;

  return (
    <div>
      <div className="text-center mb-6">
        <h3 className="text-xs font-black text-rw-ink tracking-wider mb-3">
          {isMarked
            ? '印のついた語は、この意味で合っている？'
            : `「${question.correctAnswer.lemma}」は、この文でこの意味で合っている？`}
        </h3>
        <div className="bg-rw-paper p-5 rounded-2xl border-2 border-rw-ink mb-3 text-left">
          <p className="text-rw-ink font-serif text-lg leading-relaxed mb-3">
            <MarkedSentence text={sentence} word={question.correctAnswer} />
          </p>
          <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-1">意味</p>
          <p className="text-lg font-black text-rw-ink tracking-tight">{stripSenseBrackets(question.meaning)}</p>
        </div>

        {/* Example Display - 補助例文は非表示 */}
        <ExampleDisplay
          exampleKobun=""
          exampleModern={question.exampleModern}
          phase={answered ? 'answer' : 'question'}
          className="mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={() => handleAnswer(true)}
            disabled={answered}
            className={buttonClass(true)}
            style={buttonTone(true)}
          >
            ○ 正しい
            {buttonTag(true)}
          </button>
          <button
            onClick={() => handleAnswer(false)}
            disabled={answered}
            className={buttonClass(false)}
            style={buttonTone(false)}
          >
            × 正しくない
            {buttonTag(false)}
          </button>
        </div>

        {/* 正解時: 核イメージを1行だけ (テンポは崩さない) */}
        {answeredCorrectly === true && <WordInsightStrip word={question.correctAnswer} />}

        {/* 不正解時: この例文の正しい意味と「なぜその意味か」 */}
        {answeredCorrectly === false && (
          <div className="mt-3 text-left">
            <div className="p-3 bg-rw-paper border-2 border-rw-accent rounded-xl mb-3">
              <p className="text-xs font-black text-rw-accent tracking-wider mb-1">この例文での正しい意味</p>
              <p className="text-rw-ink font-black text-base">
                {question.correctAnswer?.senseNorm || stripSenseBrackets(question.correctAnswer?.sense || '')}
              </p>
            </div>
            <WordInsightPanel word={question.correctAnswer} />
          </div>
        )}

        {/* 不正解の場合のみ次へボタン表示 */}
        {answeredCorrectly === false && (
          <div className="mt-8 text-center">
            <button
              onClick={onNext}
              className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
            >
              つぎへ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
