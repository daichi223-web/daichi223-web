import React, { useState } from 'react';
import { Word, MultiMeaningWord } from '../../types';
import { dataParser } from '../../utils/dataParser';

export interface ExampleComprehensionContentProps {
  word: MultiMeaningWord;
  onCheck: (answers: {[key: string]: string}) => void;
  onNext?: () => void;
}

export function ExampleComprehensionContent({ word, onCheck, onNext }: ExampleComprehensionContentProps) {
  // Defensive check: ensure word exists and has required properties
  if (!word || !word.lemma || !word.meanings || !Array.isArray(word.meanings)) {
    return (
      <div className="text-center p-8">
        <p className="text-slate-500">単語データが無効です。</p>
      </div>
    );
  }

  const [answers, setAnswers] = useState<{[key: string]: string}>({});
  const [shuffledMeanings, setShuffledMeanings] = useState<Word[]>([]);
  const [checked, setChecked] = useState(false);

  // Reset state and reshuffle meanings when word changes
  React.useEffect(() => {
    setAnswers({});
    setChecked(false);
    setShuffledMeanings([...word.meanings].sort(() => Math.random() - 0.5));
  }, [word.lemma, word.meanings]);

  const handleAnswerSelect = (exampleQid: string, selectedQid: string) => {
    if (checked) return;
    setAnswers(prev => ({ ...prev, [exampleQid]: selectedQid }));
  };

  const handleCheck = () => {
    if (checked) return;
    setChecked(true);
    onCheck(answers);
  };

  // 全問正解かどうかを判定
  const isAllCorrect = checked && word.meanings.every(meaning => answers[meaning.qid] === meaning.qid);

  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-2xl font-semibold text-slate-800 mb-1">{word?.lemma || 'データなし'}</h2>
      </div>

      <div className="space-y-2 mb-4">
        {(word.meanings || []).filter(meaning => meaning && meaning.qid && meaning.examples?.[0]?.jp).map((meaning) => {
          const isCorrect = answers[meaning.qid] === meaning.qid;
          const hasAnswer = answers[meaning.qid];
          const isWrong = hasAnswer && !isCorrect;

          // Get sense-priority examples for this meaning
          const examples = dataParser.getExamplesForSense(meaning, meaning.qid, word);
          const exampleIndex = 0; // Use first example for consistency
          const exampleKobun = examples.kobun[exampleIndex] || meaning.examples?.[0]?.jp || '';
          const exampleModern = examples.modern[exampleIndex] || meaning.examples?.[0]?.translation || '';

          let containerClass = 'p-3 rounded-lg';
          if (checked) {
            containerClass += isCorrect ? ' bg-green-100 border-2 border-green-500' : ' bg-red-100 border-2 border-red-500';
          } else {
            containerClass += ' bg-slate-100';
          }

          return (
            <div key={meaning.qid} className={containerClass}>
              <p className="text-slate-700 mb-2">
                {dataParser.getEmphasizedExample(exampleKobun, word.lemma || '') || 'データなし'}
              </p>

              {/* チェック後に誤答の場合は正解と現代語訳を表示 */}
              {checked && isWrong && (
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800 mb-1">正解:</p>
                  <p className="text-green-900 font-bold mb-2">{meaning.sense}</p>
                  <p className="text-sm text-green-800">{exampleModern}</p>
                </div>
              )}

              <p className="text-sm font-medium text-slate-600 mb-2 w-full">意味を選択:</p>
              <div className="flex flex-wrap gap-2">
                {shuffledMeanings.filter(m => m && m.qid && m.sense).map((m) => {
                  let buttonClass = 'px-3 py-2 border-2 rounded-md transition text-slate-700 text-sm font-medium';

                  if (checked) {
                    buttonClass += ' pointer-events-none opacity-75 cursor-not-allowed';
                    if (m.qid === meaning.qid) {
                      // Correct answer
                      buttonClass += ' bg-green-500 text-white border-green-500';
                    } else if (answers[meaning.qid] === m.qid) {
                      // Selected wrong answer
                      buttonClass += ' bg-red-400 text-white border-red-400';
                    } else {
                      buttonClass += ' bg-white border-slate-200';
                    }
                  } else {
                    if (answers[meaning.qid] === m.qid) {
                      buttonClass += ' bg-blue-500 text-white border-blue-500';
                    } else {
                      buttonClass += ' bg-white border-slate-200 hover:bg-slate-50 hover:border-blue-400';
                    }
                  }

                  return (
                    <button
                      key={m.qid}
                      onClick={() => handleAnswerSelect(meaning.qid, m.qid)}
                      className={buttonClass}
                    >
                      {m.sense || 'データなし'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!checked && (
        <div className="text-center">
          <button
            onClick={handleCheck}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            答え合わせ
          </button>
        </div>
      )}

      {/* 不正解がある場合のみ「次へ」ボタンを表示 */}
      {checked && !isAllCorrect && onNext && (
        <div className="text-center mt-6">
          <button
            onClick={onNext}
            className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
