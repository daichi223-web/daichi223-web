import React, { useState } from 'react';
import { Word } from '../../types';
import ExampleDisplay from '../ExampleDisplay';

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

  // 正解時に自動遷移
  React.useEffect(() => {
    if (answeredCorrectly === true && onNext) {
      const timer = setTimeout(() => {
        onNext();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [answeredCorrectly, onNext]);

  const handleAnswer = (answer: boolean) => {
    if (answered) return;
    setAnswered(true);
    setSelectedAnswer(answer);
    const isCorrect = answer === question.isCorrect;
    setAnsweredCorrectly(isCorrect);
    onAnswer(answer);
  };

  // ボタンのスタイル決定
  const getMaruBtnClass = () => {
    const base = 'flex-1 font-black py-4 px-6 rounded-xl transition border-2 text-lg tracking-widest';
    if (!answered) {
      return `${base} bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-accent`;
    }
    // 答えた後
    if (selectedAnswer === true) {
      // ユーザーが ○ を選んだ
      return question.isCorrect
        ? `${base} bg-rw-accent border-rw-accent text-rw-paper opacity-100 pointer-events-none`
        : `${base} bg-rw-primary border-rw-primary text-rw-paper opacity-100 pointer-events-none`;
    }
    // ユーザーが × を選んだ → ○ ボタンは非選択
    return `${base} bg-rw-paper border-rw-rule text-rw-ink-soft opacity-60 pointer-events-none`;
  };

  const getBatsuBtnClass = () => {
    const base = 'flex-1 font-black py-4 px-6 rounded-xl transition border-2 text-lg tracking-widest';
    if (!answered) {
      return `${base} bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-primary`;
    }
    if (selectedAnswer === false) {
      // ユーザーが × を選んだ
      return question.isCorrect === false
        ? `${base} bg-rw-accent border-rw-accent text-rw-paper opacity-100 pointer-events-none`
        : `${base} bg-rw-primary border-rw-primary text-rw-paper opacity-100 pointer-events-none`;
    }
    return `${base} bg-rw-paper border-rw-rule text-rw-ink-soft opacity-60 pointer-events-none`;
  };

  return (
    <div>
      <div className="text-center mb-6">
        <h3 className="text-xs font-black text-rw-ink-soft tracking-widest mb-3">この組み合わせは正しいかな？</h3>
        <div className="bg-rw-paper p-5 rounded-2xl border-2 border-rw-ink mb-3 text-left">
          <p className="text-rw-ink font-serif text-lg leading-relaxed mb-3">{question.exampleKobun || question.example}</p>
          <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-1">意味</p>
          <p className="text-lg font-black text-rw-ink tracking-tight">{question.meaning}</p>
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
            className={getMaruBtnClass()}
          >
            ○ 正しい
          </button>
          <button
            onClick={() => handleAnswer(false)}
            disabled={answered}
            className={getBatsuBtnClass()}
          >
            × 正しくない
          </button>
        </div>

        {/* 不正解の場合のみ次へボタン表示 */}
        {answeredCorrectly === false && (
          <div className="mt-8 text-center">
            <button
              onClick={onNext}
              className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: '0 4px 0 var(--rw-ink)' }}
            >
              つぎへ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
