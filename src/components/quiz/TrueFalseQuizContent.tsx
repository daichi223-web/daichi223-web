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

  // Reset state when question changes
  React.useEffect(() => {
    setAnswered(false);
    setAnsweredCorrectly(null);
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
    const isCorrect = answer === question.isCorrect;
    setAnsweredCorrectly(isCorrect);
    onAnswer(answer);
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h3 className="text-lg font-bold text-slate-700 mb-2">この組み合わせは正しいですか？</h3>
        <div className="bg-slate-100 p-3 rounded-lg mb-2">
          <p className="text-slate-700 mb-2">{question.exampleKobun || question.example}</p>
          <p className="text-sm text-slate-500 mb-2">意味:</p>
          <p className="text-lg font-bold text-slate-800">{question.meaning}</p>
        </div>

        {/* Example Display - 補助例文は非表示 */}
        <ExampleDisplay
          exampleKobun=""
          exampleModern={question.exampleModern}
          phase={answered ? 'answer' : 'question'}
          className="mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={() => handleAnswer(true)}
            disabled={answered}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-lg transition disabled:opacity-50"
          >
            正しい
          </button>
          <button
            onClick={() => handleAnswer(false)}
            disabled={answered}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-6 rounded-lg transition disabled:opacity-50"
          >
            正しくない
          </button>
        </div>

        {/* 不正解の場合のみ次へボタン表示 */}
        {answeredCorrectly === false && (
          <div className="mt-8 text-center">
            <button
              onClick={onNext}
              className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-lg transition"
            >
              次へ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
