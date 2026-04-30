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
        <p className="text-rw-ink-soft">問題データの読み込み中...</p>
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
          <h2 className="text-2xl font-black text-rw-ink leading-snug tracking-tight">{question.correct?.lemma || 'データなし'}</h2>
        </div>

        {/* Example Display */}
        <ExampleDisplay
          exampleKobun={question.exampleKobun}
          exampleModern={question.exampleModern}
          phase={showWritingResult ? 'answer' : 'question'}
          className="mb-4"
        />

        <div className="bg-rw-paper p-4 rounded-2xl border-2 border-rw-ink mb-2">
          <label className="block text-xs font-black text-rw-ink mb-2 tracking-wider">
            古典単語の意味をかいてね
          </label>
          <textarea
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            className="w-full p-4 bg-rw-paper border-2 border-rw-ink rounded-2xl font-serif text-base text-rw-ink resize-none outline-none focus:border-rw-primary transition-colors"
            rows={3}
            placeholder="古典単語の意味を入力してください..."
          />
          {!showWritingResult && (
            <div className="mt-4 text-center">
              <button
                onClick={handleWritingSubmitClick}
                className="bg-rw-ink text-rw-paper font-black rounded-full px-6 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
                style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
              >
                採点する
              </button>
            </div>
          )}
        </div>

        {showWritingResult && (
          <div className="bg-rw-paper p-6 rounded-2xl border-2 border-rw-ink mb-4">
            <div className="text-center mb-2">
              <h3 className="text-xs font-black text-rw-ink-soft tracking-widest mb-2">採点結果</h3>
              <div
                className="text-4xl font-black mb-2 tracking-tight"
                style={{
                  color:
                    writingResult.score >= 80
                      ? 'var(--rw-accent)'
                      : writingResult.score >= 50
                      ? 'var(--rw-pop)'
                      : 'var(--rw-primary)'
                }}
              >
                {writingResult.score}<span className="text-base text-rw-ink-soft font-bold ml-1">/100</span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-1">あなたの回答</p>
                <p className="text-rw-ink bg-rw-bg p-3 rounded-xl font-serif border border-rw-rule">{userAnswer}</p>
              </div>
              <div>
                <p className="text-xs font-black text-rw-accent tracking-wider mb-1">正解</p>
                <p className="text-rw-ink bg-rw-accent-soft p-3 rounded-xl font-serif border-2 border-rw-accent">
                  {(() => {
                    const bracketMatch = question.correct.sense.match(/〔\s*(.+?)\s*〕/);
                    return bracketMatch ? bracketMatch[1].trim() : question.correct.sense;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-1">フィードバック</p>
                <p className="text-rw-ink leading-relaxed">{writingResult.feedback}</p>
              </div>

              {/* 採点結果訂正UI */}
              {writingUserJudgment === undefined && (
                <div className="mt-4 p-4 rounded-xl bg-rw-primary-soft border-2 border-rw-primary">
                  <p className="text-sm font-black text-rw-primary mb-1">
                    自動採点の結果に異議がありますか？
                  </p>
                  <p className="text-xs text-rw-ink-soft mb-3 font-medium">
                    {writingResult.score >= 60
                      ? '現在の判定: 正解（+1点）'
                      : '現在の判定: 不正解（+0点）'}
                  </p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button
                      onClick={() => handleWritingUserJudgment(true)}
                      className={`px-5 py-2 font-black rounded-full transition ${
                        writingResult.score >= 60
                          ? 'bg-rw-accent-soft text-rw-accent border-2 border-rw-accent'
                          : 'bg-rw-accent text-rw-paper border-2 border-rw-accent hover:-translate-y-0.5'
                      }`}
                    >
                      {writingResult.score >= 60 ? '○ 正解のまま' : '○ 正解に変更'}
                    </button>
                    <button
                      onClick={() => handleWritingUserJudgment('partial')}
                      className="px-5 py-2 bg-rw-paper text-rw-ink-soft border-2 border-rw-rule font-black rounded-full transition hover:border-rw-ink-soft"
                    >
                      そのまま進む
                    </button>
                    <button
                      onClick={() => handleWritingUserJudgment(false)}
                      className={`px-5 py-2 font-black rounded-full transition ${
                        writingResult.score < 60
                          ? 'bg-rw-primary-soft text-rw-primary border-2 border-rw-primary'
                          : 'bg-rw-primary text-rw-paper border-2 border-rw-primary hover:-translate-y-0.5'
                      }`}
                    >
                      {writingResult.score < 60 ? '× 不正解のまま' : '× 不正解に変更'}
                    </button>
                  </div>
                </div>
              )}

              {/* ユーザー判定結果表示 */}
              {writingUserJudgment !== undefined && (
                <div className="mt-4 p-3 rounded-xl bg-rw-bg border-2 border-rw-rule">
                  <div
                    className="text-center font-black"
                    style={{
                      color:
                        writingUserJudgment === true
                          ? 'var(--rw-accent)'
                          : writingUserJudgment === 'partial'
                          ? 'var(--rw-pop)'
                          : 'var(--rw-primary)'
                    }}
                  >
                    あなたの判定: {writingUserJudgment === true ? '○ 正解' : writingUserJudgment === 'partial' ? '△ 部分点' : '× 不正解'}
                  </div>
                  <p className="text-xs text-rw-ink-soft mt-1 text-center font-medium">次の問題に進みます...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {nextButtonVisible && (
          <div className="mt-8 text-center">
            <button
              onClick={onNext}
              className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: '0 4px 0 var(--rw-ink)' }}
            >
              つぎへ →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ターゲット語をハイライトしてレンダリング (sentence-meaning / meaning-writing 系の文表示)
  const renderHighlightedSentence = (text: string, lemma: string) => {
    if (!lemma || !text) return text;

    // 既に〔lemma〕が含まれている場合はその部分をハイライト
    const bracketed = `〔${lemma}〕`;
    if (text.includes(bracketed)) {
      const parts = text.split(bracketed);
      return parts.flatMap((part, i) =>
        i < parts.length - 1
          ? [
              <React.Fragment key={`p-${i}`}>{part}</React.Fragment>,
              <span
                key={`h-${i}`}
                className="inline-block whitespace-nowrap font-black px-2 rounded"
                style={{ background: 'var(--rw-pop)', opacity: 0.6 }}
              >
                {lemma}
              </span>
            ]
          : [<React.Fragment key={`p-${i}`}>{part}</React.Fragment>]
      );
    }

    // lemma が含まれていれば最初の出現箇所をハイライト
    if (text.includes(lemma)) {
      const idx = text.indexOf(lemma);
      return (
        <>
          {text.slice(0, idx)}
          <span
            className="inline-block whitespace-nowrap font-black px-2 rounded"
            style={{ background: 'var(--rw-pop)', opacity: 0.6 }}
          >
            {lemma}
          </span>
          {text.slice(idx + lemma.length)}
        </>
      );
    }

    return text;
  };

  return (
    <div>
      <div className="mb-4">
        {quizType === 'word-meaning' ? (
          <div className="text-center">
            <h2 className="text-3xl font-black text-rw-ink leading-snug tracking-tight">
              {question.correct?.lemma || 'データなし'}
            </h2>
          </div>
        ) : quizType === 'word-reverse' ? (
          <div className="text-center">
            <h2 className="text-2xl font-black text-rw-ink leading-snug tracking-tight mb-2">
              {question.correct?.sense || 'データなし'}
            </h2>
            <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-5">
              <div className="font-serif text-base text-rw-ink leading-relaxed">
                {question.exampleModern || 'データなし'}
              </div>
            </div>
          </div>
        ) : (
          // sentence-meaning: 古文を paper card で表示してターゲット語をハイライト
          <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-5">
            <div className="font-serif text-lg text-rw-ink leading-loose font-medium">
              {(() => {
                const lemma = question.correct.lemma || '';
                const exampleText = question.exampleKobun || question.correct.examples?.[0]?.jp || 'データなし';
                return renderHighlightedSentence(exampleText, lemma);
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Example Display for word-meaning quiz type only */}
      {quizType === 'word-meaning' && (
        <div className="mb-4">
          {!showExample ? (
            <button
              onClick={() => setShowExample(true)}
              className="w-full py-3 px-4 bg-rw-paper border-2 border-rw-ink text-rw-ink font-black rounded-full transition hover:bg-rw-bg"
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
                  className="w-full mt-2 py-2 px-4 bg-rw-paper border-2 border-rw-rule text-rw-ink-soft font-black rounded-full transition hover:border-rw-ink-soft text-sm"
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
            <p className="text-xs text-rw-ink-soft font-black tracking-wider">参考：見出し語</p>
            <p className="text-rw-ink font-black">{question.correct?.lemma || ''}</p>
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

      <div className="space-y-2">
        {(question.options || []).map((option, index) => {
          // Defensive check: ensure option exists and has required properties
          if (!option || (!option.lemma && !option.sense) || !option.qid) {
            return (
              <div key={`invalid-${index}`} className="w-full text-left p-3 border-2 border-rw-primary rounded-xl bg-rw-primary-soft">
                <span className="text-rw-primary font-black">無効なオプションデータ</span>
              </div>
            );
          }

          const isCorrectOption = option.qid === question.correct?.qid;
          const isSelectedWrong = selectedOption && option.qid === selectedOption.qid && answeredCorrectly === false;
          const answered = answeredCorrectly !== null;

          let buttonClass = 'w-full text-left p-3 rounded-xl border-2 transition font-medium flex items-center';
          let labelBg = 'bg-rw-bg text-rw-ink-soft';

          if (answered) {
            buttonClass += ' pointer-events-none';
            if (isCorrectOption) {
              buttonClass += ' bg-rw-accent text-rw-paper border-rw-accent';
              labelBg = 'bg-rw-paper text-rw-accent';
            } else if (isSelectedWrong) {
              buttonClass += ' bg-rw-primary text-rw-paper border-rw-primary';
              labelBg = 'bg-rw-paper text-rw-primary';
            } else {
              buttonClass += ' bg-rw-paper border-rw-rule text-rw-ink opacity-60';
            }
          } else {
            buttonClass += ' bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-ink-soft';
          }

          return (
            <button
              key={option.qid}
              onClick={() => handleOptionClick(option)}
              className={buttonClass}
              style={{ minHeight: '44px' }}
            >
              <span className={`inline-flex items-center justify-center w-7 h-7 mr-3 rounded-full font-black text-sm flex-shrink-0 ${labelBg}`}>
                {optionLabels[index]}
              </span>
              <span className="flex-1">
                {quizType === 'word-reverse' ? (option.lemma || 'データなし') : (option.sense || 'データなし')}
              </span>
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
          className="mt-3 bg-rw-primary-soft rounded-xl border-2 border-rw-primary"
        />
      )}

      {/* 不正解の場合のみ次へボタン表示 */}
      {answeredCorrectly === false && (
        <div className="mt-8 text-center">
          <button
            onClick={onNext}
            className="bg-rw-primary text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 0 var(--rw-ink)' }}
          >
            つぎへ →
          </button>
        </div>
      )}
    </div>
  );
}
