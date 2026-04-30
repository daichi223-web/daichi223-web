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
        <p className="text-rw-ink-soft">単語データが無効です。</p>
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
        <p className="text-xs font-black text-rw-ink-soft tracking-widest mb-1">見出し語</p>
        <h2 className="text-2xl font-black text-rw-ink tracking-tight">{word?.lemma || 'データなし'}</h2>
      </div>

      <div className="space-y-3 mb-4">
        {(word.meanings || []).filter(meaning => meaning && meaning.qid && meaning.examples?.[0]?.jp).map((meaning) => {
          const isCorrect = answers[meaning.qid] === meaning.qid;
          const hasAnswer = answers[meaning.qid];
          const isWrong = hasAnswer && !isCorrect;

          // Get sense-priority examples for this meaning
          const examples = dataParser.getExamplesForSense(meaning, meaning.qid, word);
          const exampleIndex = 0; // Use first example for consistency
          const exampleKobun = examples.kobun[exampleIndex] || meaning.examples?.[0]?.jp || '';
          const exampleModern = examples.modern[exampleIndex] || meaning.examples?.[0]?.translation || '';

          let containerClass = 'p-5 rounded-2xl border-2';
          if (checked) {
            containerClass += isCorrect ? ' bg-rw-accent-soft border-rw-accent' : ' bg-rw-primary-soft border-rw-primary';
          } else {
            containerClass += ' bg-rw-paper border-rw-ink';
          }

          return (
            <div key={meaning.qid} className={containerClass}>
              <p className="text-rw-ink font-serif text-base leading-relaxed mb-3">
                {dataParser.getEmphasizedExample(exampleKobun, word.lemma || '') || 'データなし'}
              </p>

              {/* チェック後に誤答の場合は正解と現代語訳を表示 */}
              {checked && isWrong && (
                <div className="mb-3 p-3 bg-rw-paper border-2 border-rw-accent rounded-xl">
                  <p className="text-xs font-black text-rw-accent tracking-wider mb-1">正解</p>
                  <p className="text-rw-ink font-black text-base mb-2">{meaning.sense}</p>
                  <p className="text-sm text-rw-ink-soft font-serif">{exampleModern}</p>
                </div>
              )}

              <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-2 w-full">意味を選択</p>
              <div className="flex flex-wrap gap-2">
                {shuffledMeanings.filter(m => m && m.qid && m.sense).map((m) => {
                  let buttonClass = 'px-4 py-2 border-2 rounded-xl transition text-sm font-bold';

                  if (checked) {
                    buttonClass += ' pointer-events-none';
                    if (m.qid === meaning.qid) {
                      // Correct answer
                      buttonClass += ' bg-rw-accent text-rw-paper border-rw-accent';
                    } else if (answers[meaning.qid] === m.qid) {
                      // Selected wrong answer
                      buttonClass += ' bg-rw-primary text-rw-paper border-rw-primary';
                    } else {
                      buttonClass += ' bg-rw-paper border-rw-rule text-rw-ink-soft opacity-60';
                    }
                  } else {
                    if (answers[meaning.qid] === m.qid) {
                      buttonClass += ' bg-rw-ink text-rw-paper border-rw-ink';
                    } else {
                      buttonClass += ' bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-ink';
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
            className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
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
            className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 0 var(--rw-ink)' }}
          >
            つぎへ
          </button>
        </div>
      )}
    </div>
  );
}
