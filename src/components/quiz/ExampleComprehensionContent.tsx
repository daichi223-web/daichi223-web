import React, { useEffect, useState } from 'react';
import { Word, MultiMeaningWord } from '../../types';
import { dataParser } from '../../utils/dataParser';
import { MarkedSentence } from './MarkedSentence';
import { PolysemyInsight } from './WordInsightPanel';
import { answerTone, quizMeanings, stripSenseBrackets } from './writingVerdict';

export interface ExampleComprehensionContentProps {
  word: MultiMeaningWord;
  onCheck: (answers: {[key: string]: string}) => void;
  onNext?: () => void;
}

export function ExampleComprehensionContent({ word, onCheck, onNext }: ExampleComprehensionContentProps) {
  const [answers, setAnswers] = useState<{[key: string]: string}>({});
  const [shuffledMeanings, setShuffledMeanings] = useState<Word[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!word || !word.lemma || !word.meanings || !Array.isArray(word.meanings)) return;
    setAnswers({});
    setChecked(false);
    setShuffledMeanings([...word.meanings].sort(() => Math.random() - 0.5));
  }, [word?.lemma, word?.meanings]);

  // Defensive check: ensure word exists and has required properties
  if (!word || !word.lemma || !word.meanings || !Array.isArray(word.meanings)) {
    return (
      <div className="text-center p-8">
        <p className="text-rw-ink-soft">単語データが無効です。</p>
      </div>
    );
  }

  const handleAnswerSelect = (exampleQid: string, selectedQid: string) => {
    if (checked) return;
    setAnswers(prev => ({ ...prev, [exampleQid]: selectedQid }));
  };

  const handleCheck = () => {
    if (checked) return;
    setChecked(true);
    onCheck(answers);
  };

  // 画面に出す意味（例文のあるもの）。採点・記録（App.tsx）も同じ条件で数える
  const meanings = quizMeanings(word);
  const unansweredCount = meanings.filter(meaning => !answers[meaning.qid]).length;

  // 全問正解かどうかを判定（画面に出した意味だけで数える）
  const isAllCorrect = checked && meanings.length > 0 && meanings.every(meaning => answers[meaning.qid] === meaning.qid);

  return (
    <div>
      <div className="text-center mb-4">
        <p className="text-xs font-black text-rw-ink-soft tracking-widest mb-1">見出し語</p>
        <h2 className="text-2xl font-black text-rw-ink tracking-tight">{word?.lemma || 'データなし'}</h2>
      </div>

      <div className="space-y-3 mb-4">
        {meanings.map((meaning) => {
          const isCorrect = answers[meaning.qid] === meaning.qid;
          const hasAnswer = !!answers[meaning.qid];
          const isWrong = hasAnswer && !isCorrect;
          // 答え合わせの時点で選んでいなかった例文。正解は示すが、自分で当てた例文とは見た目を分ける
          const isUnanswered = checked && !hasAnswer;

          // Get sense-priority examples for this meaning
          const examples = dataParser.getExamplesForSense(meaning, meaning.qid, word);
          const exampleIndex = 0; // Use first example for consistency
          const exampleKobun = examples.kobun[exampleIndex] || meaning.examples?.[0]?.jp || '';
          const exampleModern = examples.modern[exampleIndex] || meaning.examples?.[0]?.translation || '';

          let containerClass = 'p-5 rounded-2xl border-2';
          if (checked) {
            containerClass += isCorrect
              ? ' bg-rw-accent-soft border-rw-accent'
              : isUnanswered
              ? ' bg-rw-paper border-rw-primary border-dashed'
              : ' bg-rw-primary-soft border-rw-primary';
          } else {
            containerClass += ' bg-rw-paper border-rw-ink';
          }

          return (
            <div key={meaning.qid} className={containerClass}>
              <p className="text-rw-ink font-serif text-base leading-relaxed mb-3">
                {exampleKobun ? <MarkedSentence text={exampleKobun} word={meaning} /> : 'データなし'}
              </p>

              {/* チェック後、誤答と未回答には正解と現代語訳を表示。未回答は見出しで分かるようにする */}
              {checked && (isWrong || isUnanswered) && (
                <div className="mb-3 p-3 bg-rw-paper border-2 border-rw-accent rounded-xl">
                  <p className="text-xs font-black text-rw-ink tracking-wider mb-1">
                    正解
                    {isUnanswered && (
                      <span className="ml-2 inline-block px-2 py-0.5 rounded-full border border-rw-ink-soft bg-rw-bg text-rw-ink">
                        未回答
                      </span>
                    )}
                  </p>
                  <p className="text-rw-ink font-black text-base mb-2">{stripSenseBrackets(meaning.sense)}</p>
                  {meaning.decider && (
                    <p className="text-xs font-bold text-rw-ink mb-2 leading-relaxed">
                      🔑 決め手　{meaning.decider.clue}
                    </p>
                  )}
                  <p className="text-sm text-rw-ink-soft font-serif">{exampleModern}</p>
                </div>
              )}

              <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-2 w-full">意味を選択</p>
              <div className="flex flex-wrap gap-2">
                {shuffledMeanings.filter(m => m && m.qid && m.sense).map((m) => {
                  let buttonClass = 'px-4 py-2 border-2 rounded-xl transition text-sm font-bold';
                  // 答え合わせ後: 薄い地＋濃い文字＋太い枠＋記号（正解 ○・選んだ誤答 ×）
                  let tone: React.CSSProperties | undefined;
                  let sign = '';

                  if (checked) {
                    buttonClass += ' pointer-events-none';
                    if (m.qid === meaning.qid) {
                      // Correct answer
                      buttonClass += ' text-rw-ink';
                      tone = answerTone('var(--rw-accent)');
                      sign = '○ ';
                    } else if (answers[meaning.qid] === m.qid) {
                      // Selected wrong answer
                      buttonClass += ' text-rw-ink';
                      tone = answerTone('var(--rw-primary)');
                      sign = '× ';
                    } else {
                      buttonClass += ' bg-rw-paper border-rw-rule text-rw-ink-soft';
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
                      style={tone}
                    >
                      {sign}{stripSenseBrackets(m.sense) || 'データなし'}
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
          {/* 未回答があっても答え合わせはできる。数だけ知らせる */}
          {unansweredCount > 0 && (
            <p className="text-xs font-black text-rw-ink tracking-wider mb-3">未回答 {unansweredCount}件</p>
          )}
          <button
            onClick={handleCheck}
            className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
          >
            答え合わせ
          </button>
        </div>
      )}

      {/* 答え合わせ後: 核イメージ＋意味ごとの決め手で1つの絵にまとめる */}
      {checked && <PolysemyInsight meanings={word.meanings} className="mb-4" />}

      {/* 不正解がある場合のみ「次へ」ボタンを表示 */}
      {checked && !isAllCorrect && onNext && (
        <div className="text-center mt-6">
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
  );
}
