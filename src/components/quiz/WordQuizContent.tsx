import React, { useState } from 'react';
import { Word } from '../../types';
import ExampleDisplay from '../ExampleDisplay';

interface QuizQuestion {
  correct: Word;
  options: Word[];
  exampleIndex?: number;
  exampleKobun?: string;
  exampleModern?: string;
}

type WordQuizType = 'word-meaning' | 'word-reverse' | 'sentence-meaning' | 'meaning-writing';

export interface WordQuizContentProps {
  question: QuizQuestion;
  quizType: WordQuizType;
  onAnswer: (selected: Word, correct: Word, isReverse?: boolean) => void;
  onWritingSubmit: (userAnswer: string, correctAnswer: string) => void;
  nextButtonVisible: boolean;
  onNext: () => void;
  showWritingResult: boolean;
  writingResult: {score: number; feedback: string};
  writingUserJudgment?: boolean | 'partial' | undefined;
  handleWritingUserJudgment?: (judgment: boolean | 'partial') => void;
}

export function WordQuizContent({
  question,
  quizType,
  onAnswer,
  onWritingSubmit,
  nextButtonVisible,
  onNext,
  showWritingResult,
  writingResult,
  writingUserJudgment,
  handleWritingUserJudgment
}: WordQuizContentProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [answeredCorrectly, setAnsweredCorrectly] = useState<boolean | null>(null);
  const [selectedOption, setSelectedOption] = useState<Word | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [showModernTranslation, setShowModernTranslation] = useState(false);

  // Reset state when question changes
  React.useEffect(() => {
    setAnsweredCorrectly(null);
    setSelectedOption(null);
    setUserAnswer('');
    setShowExample(false);
    setShowModernTranslation(false);
  }, [question.correct.qid]);

  // 正解時に自動遷移
  React.useEffect(() => {
    if (answeredCorrectly === true && onNext) {
      const timer = setTimeout(() => {
        onNext();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [answeredCorrectly, onNext]);

  // Defensive check: ensure question and question.correct exist
  if (!question || !question.correct || !question.correct.lemma) {
    return (
      <div className="text-center p-8">
        <p className="text-slate-500">問題データの読み込み中...</p>
      </div>
    );
  }

  const handleOptionClick = (option: Word) => {
    if (answeredCorrectly !== null) return;

    setSelectedOption(option);
    const isCorrect = option.qid === question.correct.qid;
    setAnsweredCorrectly(isCorrect);
    onAnswer(option, question.correct, quizType === 'word-reverse');
  };

  const handleWritingSubmitClick = () => {
    onWritingSubmit(userAnswer, question.correct.qid);
  };

  const optionLabels = ['A', 'B', 'C', 'D'];

  if (quizType === 'meaning-writing') {
    return (
      <div>
        <div className="text-center mb-4">
          <h2 className="text-2xl font-semibold text-slate-800 leading-snug">{question.correct?.lemma || 'データなし'}</h2>
        </div>

        {/* Example Display */}
        <ExampleDisplay
          exampleKobun={question.exampleKobun}
          exampleModern={question.exampleModern}
          phase={showWritingResult ? 'answer' : 'question'}
          className="mb-4"
        />

        <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 mb-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            古典単語の意味を記述してください
          </label>
          <textarea
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            className="w-full p-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows={3}
            placeholder="古典単語の意味を入力してください..."
          />
          {!showWritingResult && (
            <div className="mt-4 text-center">
              <button
                onClick={handleWritingSubmitClick}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition"
              >
                回答を提出
              </button>
            </div>
          )}
        </div>

        {showWritingResult && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-4">
            <div className="text-center mb-2">
              <h3 className="text-lg font-bold text-slate-800 mb-2">採点結果</h3>
              <div className={`text-2xl font-bold mb-2 ${
                writingResult.score >= 80 ? 'text-green-600' :
                writingResult.score >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {writingResult.score}点
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-600">あなたの回答:</p>
                <p className="text-slate-800 bg-slate-100 p-3 rounded-lg">{userAnswer}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">正解:</p>
                <p className="text-slate-800 bg-green-100 p-3 rounded-lg">
                  {(() => {
                    const bracketMatch = question.correct.sense.match(/〔\s*(.+?)\s*〕/);
                    return bracketMatch ? bracketMatch[1].trim() : question.correct.sense;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">フィードバック:</p>
                <p className="text-slate-700">{writingResult.feedback}</p>
              </div>

              {/* 採点結果訂正UI */}
              {writingUserJudgment === undefined && (
                <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-300">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    自動採点の結果に異議がありますか？
                  </p>
                  <p className="text-xs text-blue-600 mb-3">
                    {writingResult.score >= 60
                      ? '現在の判定: 正解（+1点）'
                      : '現在の判定: 不正解（+0点）'}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => handleWritingUserJudgment(true)}
                      className={`px-5 py-2 font-bold rounded-lg transition ${
                        writingResult.score >= 60
                          ? 'bg-green-200 text-green-800 border border-green-400'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      {writingResult.score >= 60 ? '○ 正解のまま' : '○ 正解に変更'}
                    </button>
                    <button
                      onClick={() => handleWritingUserJudgment('partial')}
                      className="px-5 py-2 bg-slate-200 text-slate-700 border border-slate-300 font-bold rounded-lg transition hover:bg-slate-300"
                    >
                      そのまま進む
                    </button>
                    <button
                      onClick={() => handleWritingUserJudgment(false)}
                      className={`px-5 py-2 font-bold rounded-lg transition ${
                        writingResult.score < 60
                          ? 'bg-red-200 text-red-800 border border-red-400'
                          : 'bg-red-500 hover:bg-red-600 text-white'
                      }`}
                    >
                      {writingResult.score < 60 ? '× 不正解のまま' : '× 不正解に変更'}
                    </button>
                  </div>
                </div>
              )}

              {/* ユーザー判定結果表示 */}
              {writingUserJudgment !== undefined && (
                <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className={`text-center font-bold ${
                    writingUserJudgment === true ? 'text-green-700' :
                    writingUserJudgment === 'partial' ? 'text-yellow-700' : 'text-red-700'
                  }`}>
                    あなたの判定: {writingUserJudgment === true ? '○ 正解' : writingUserJudgment === 'partial' ? '△ 部分点' : '× 不正解'}
                  </div>
                  <p className="text-xs text-blue-700 mt-1 text-center">次の問題に進みます...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {nextButtonVisible && (
          <div className="mt-8 text-center">
            <button
              onClick={onNext}
              className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-lg transition"
            >
              次の問題へ
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-2xl font-semibold text-slate-800 leading-snug">
          {quizType === 'word-meaning' ? (
            question.correct?.lemma || 'データなし'
          ) : quizType === 'word-reverse' ? (
            // 意味→単語モードでは意味と現代語訳例文を表示
            <div>
              <div className="mb-2">{question.correct?.sense || 'データなし'}</div>
              <div className="text-base text-slate-700">
                {question.exampleModern || 'データなし'}
              </div>
            </div>
          ) : (() => {
             const lemma = question.correct.lemma || '';
             const exampleText = question.exampleKobun || question.correct.examples?.[0]?.jp || 'データなし';

             if (lemma && exampleText !== 'データなし') {
               // 既に見出し語が正しく〔〕で囲まれている場合はそのまま返す
               if (exampleText.includes(`〔${lemma}〕`)) {
                 return exampleText;
               }

               // 見出し語が含まれているかチェック
               if (exampleText.includes(lemma)) {
                 // 既存の括弧を一旦除去してから新しく追加
                 let cleanText = exampleText.replace(/〔/g, '').replace(/〕/g, '');
                 // 最初の1つだけを置換
                 return cleanText.replace(lemma, `〔${lemma}〕`);
               }
             }

             return exampleText;
           })()}
        </h2>
      </div>

      {/* Example Display for word-meaning quiz type only */}
      {quizType === 'word-meaning' && (
        <div className="mb-4 relative">
          {!showExample ? (
            <button
              onClick={() => setShowExample(true)}
              className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition"
            >
              例文を表示
            </button>
          ) : (
            <>
              <ExampleDisplay
                exampleKobun={question.exampleKobun}
                exampleModern={question.exampleModern}
                showKobun={true}
                showModern={showModernTranslation}
                forceShowModern={showModernTranslation}
                phase={answeredCorrectly !== null ? 'answer' : 'question'}
              />
              {!showModernTranslation && answeredCorrectly === null && (
                <button
                  onClick={() => setShowModernTranslation(true)}
                  className="w-full mt-2 py-2 px-4 bg-slate-500 hover:bg-slate-600 text-white font-medium rounded-lg transition text-sm"
                >
                  現代語訳を表示
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Example Display for sentence-meaning quiz type */}
      {quizType === 'sentence-meaning' && (
        <>
          <div className="text-center mb-2">
            <p className="text-sm text-slate-500">参考：見出し語</p>
            <p className="text-slate-700 font-medium">{question.correct?.lemma || ''}</p>
          </div>
          {/* Show modern translation when answered incorrectly */}
          {answeredCorrectly !== null && answeredCorrectly === false && (
            <ExampleDisplay
              exampleKobun=""
              exampleModern={question.exampleModern}
              phase="answer"
              showKobun={false}
              showModern={true}
              className="mb-4"
            />
          )}
        </>
      )}

      <div className="space-y-1">
        {(question.options || []).map((option, index) => {
          // Defensive check: ensure option exists and has required properties
          if (!option || (!option.lemma && !option.sense) || !option.qid) {
            return (
              <div key={`invalid-${index}`} className="w-full text-left p-3 border-2 border-red-200 rounded-lg bg-red-50">
                <span className="text-red-600">無効なオプションデータ</span>
              </div>
            );
          }

          let buttonClass = 'w-full text-left py-2.5 px-3 border-2 border-slate-200 rounded-md transition text-slate-700 font-medium';

          if (answeredCorrectly !== null) {
            buttonClass += ' pointer-events-none opacity-80';
            if (option.qid === question.correct?.qid) {
              buttonClass = buttonClass.replace('border-slate-200', 'border-green-400 bg-green-400 text-white');
            } else if (selectedOption && option.qid === selectedOption.qid && !answeredCorrectly) {
              buttonClass = buttonClass.replace('border-slate-200', 'border-red-400 bg-red-400 text-white');
            }
          } else {
            buttonClass += ' hover:bg-slate-100 hover:border-blue-400';
          }

          return (
            <button
              key={option.qid}
              onClick={() => handleOptionClick(option)}
              className={buttonClass}
              style={{ minHeight: '44px' }}
            >
              <span className="inline-flex items-center justify-center w-6 h-6 mr-4 rounded-full bg-slate-200 text-slate-600 font-bold">
                {optionLabels[index]}
              </span>
              {quizType === 'word-reverse' ? (option.lemma || 'データなし') : (option.sense || 'データなし')}
            </button>
          );
        })}
      </div>

      {/* 不正解時：例文で文脈記憶を補強 */}
      {answeredCorrectly === false && (quizType === 'word-meaning' || quizType === 'word-reverse') && (
        <ExampleDisplay
          exampleKobun={question.exampleKobun}
          exampleModern={question.exampleModern}
          phase="answer"
          forceShowModern={true}
          className="mt-3 bg-amber-50 rounded-lg border border-amber-200"
        />
      )}

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
  );
}
