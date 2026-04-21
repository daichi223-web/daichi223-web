import React, { useState, useEffect, useCallback } from 'react';
import { MultiMeaningWord } from '../../types';
import { dataParser } from '../../utils/dataParser';
import { matchSense } from '../../utils/matchSense';
import { validateConnections } from '../../lib/validateConnectionsFromFile';

export interface ContextWritingContentProps {
  word: MultiMeaningWord;
  exampleIndex: number;
  onWritingSubmit: (userAnswer: string, correctAnswer: string) => void;
  onNext: () => void;
  showWritingResult: boolean;
  writingResult: {score: number; feedback: string};
}

export function ContextWritingContent({
  word,
  exampleIndex,
  onWritingSubmit,
  onNext,
  showWritingResult,
  writingResult
}: ContextWritingContentProps) {
  const [answers, setAnswers] = useState<{[key: string]: string}>({});
  const [checked, setChecked] = useState(false);
  const [grammarIssues, setGrammarIssues] = useState<{[key: string]: any[]}>({});
  const [matchResults, setMatchResults] = useState<{[key: string]: any}>({});
  const [userJudgments, setUserJudgments] = useState<{[key: string]: boolean}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset answers when word changes
  React.useEffect(() => {
    setAnswers({});
    setChecked(false);
    setGrammarIssues({});
    setMatchResults({});
    setUserJudgments({});
    setIsSubmitting(false);
  }, [word.lemma]);

  const handleAnswerChange = (meaningQid: string, value: string) => {
    if (checked) return;
    setAnswers(prev => ({ ...prev, [meaningQid]: value }));
  };

  const handleSubmit = () => {
    if (checked) return;

    // 文法チェック＆matchSenseで採点
    const newGrammarIssues: {[key: string]: any[]} = {};
    const newMatchResults: {[key: string]: any} = {};
    let isPerfectScore = true;

    word.meanings.forEach(meaning => {
      const userAnswer = (answers[meaning.qid] || '').trim();

      // 文法チェック（接続規則違反など）
      const issues = validateConnections(userAnswer);
      if (issues.length > 0) {
        newGrammarIssues[meaning.qid] = issues;
      }

      const correctAnswer = meaning.sense.replace(/〔\s*(.+?)\s*〕/, '$1').trim();
      const candidates = [{ surface: correctAnswer, norm: correctAnswer }];
      const result = matchSense(userAnswer, candidates);

      newMatchResults[meaning.qid] = result;

      // 100点満点でない、または文法エラーがあれば完璧ではない
      if (result.score !== 100 || issues.length > 0) {
        isPerfectScore = false;
      }
    });

    setGrammarIssues(newGrammarIssues);
    setMatchResults(newMatchResults);
    setChecked(true);
  };

  const handleUserJudgment = async (meaningQid: string, isCorrect: boolean) => {
    setUserJudgments(prev => ({ ...prev, [meaningQid]: isCorrect }));

    // 判定ボタン押下時に即座に送信
    const anonId = localStorage.getItem('anonId') || `anon_${Date.now()}`;
    if (!localStorage.getItem('anonId')) {
      localStorage.setItem('anonId', anonId);
    }

    const result = matchResults[meaningQid];
    const score = result?.score || 0;
    const userAnswer = (answers[meaningQid] || '').trim();

    try {
      const response = await fetch('/api/submitAnswer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qid: meaningQid,
          answerRaw: userAnswer,
          anonId,
          autoScore: score,
          autoResult: score >= 60 ? 'OK' : 'NG',
          autoReason: result?.detail || result?.reason || 'auto_grading',
          questionType: 'writing',
        }),
      });

      const data = await response.json();

      // ユーザー訂正を送信
      if (data.answerId) {
        await fetch('/api/userCorrectAnswer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answerId: data.answerId,
            userCorrection: isCorrect ? 'OK' : 'NG',
            userId: anonId,
          }),
        });
      }
    } catch (e) {
      console.error(`Failed to submit judgment for ${meaningQid}:`, e);
    }
  };

  const handleNext = useCallback(async () => {
    setIsSubmitting(true);

    try {
      // Save to Firestore with user corrections
      const anonId = localStorage.getItem('anonId') || `anon_${Date.now()}`;
      if (!localStorage.getItem('anonId')) {
        localStorage.setItem('anonId', anonId);
      }

      // 並列送信: 未判定の意味のみ送信（判定済みはスキップ）
      const submitPromises = word.meanings
        .filter(meaning => userJudgments[meaning.qid] === undefined) // 判定していない意味のみ
        .map(async (meaning) => {
          const result = matchResults[meaning.qid];
          const score = result?.score || 0;
          const userAnswer = (answers[meaning.qid] || '').trim();

          try {
            // Submit answer (判定なしの回答のみ)
            await fetch('/api/submitAnswer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                qid: meaning.qid,
                answerRaw: userAnswer,
                anonId,
                autoScore: score,
                autoResult: score >= 60 ? 'OK' : 'NG',
                autoReason: result?.detail || result?.reason || 'auto_grading',
                questionType: 'writing',
              }),
            });
          } catch (e) {
            console.error(`Failed to submit answer for ${meaning.qid}:`, e);
          }
        });

      // すべての送信が完了するまで待つ
      await Promise.all(submitPromises);

      // 正解・不正解に関わらず次の問題へ遷移
      onNext();
    } finally {
      setIsSubmitting(false);
    }
  }, [word.meanings, matchResults, userJudgments, answers, onNext]);

  // 100%のみ自動遷移
  useEffect(() => {
    if (checked) {
      const isPerfect = word.meanings.every(meaning => {
        const result = matchResults[meaning.qid];
        const issues = grammarIssues[meaning.qid] || [];
        return result?.score === 100 && issues.length === 0;
      });

      if (isPerfect) {
        const timer = setTimeout(() => {
          handleNext();
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [checked, matchResults, grammarIssues, word.meanings, handleNext]);

  // 1つでも不正解があれば「次へ」ボタン表示、全問正解なら非表示（自動遷移）
  const hasIncorrect = checked && word.meanings.some(meaning => {
    const result = matchResults[meaning.qid];
    const issues = grammarIssues[meaning.qid] || [];
    return result?.score !== 100 || issues.length > 0;
  });

  return (
    <div>
      <div className="text-center mb-4">
        <p className="text-sm text-slate-500">参考：見出し語</p>
        <p className="text-xl font-bold text-slate-800">{word.lemma}</p>
      </div>

      <div className="space-y-4 mb-4">
        {word.meanings.map((meaning) => {
          const userAnswer = answers[meaning.qid] || '';
          const correctAnswer = meaning.sense.replace(/〔\s*(.+?)\s*〕/, '$1').trim();
          const result = matchResults[meaning.qid];
          const score = result?.score || 0;
          const isCorrect = score === 100 && (grammarIssues[meaning.qid] || []).length === 0;
          const userJudgment = userJudgments[meaning.qid];

          // Get sense-priority examples for this meaning
          const examples = dataParser.getExamplesForSense(meaning, meaning.qid, word);
          const exampleKobun = examples.kobun[0] || meaning.examples?.[0]?.jp || '';
          const exampleModern = examples.modern[0] || meaning.examples?.[0]?.translation || '';

          let containerClass = 'p-3 rounded-lg border-2';
          if (checked) {
            containerClass += isCorrect ? ' bg-green-50 border-green-500' : ' bg-red-50 border-red-500';
          } else {
            containerClass += ' bg-slate-50 border-slate-200';
          }

          return (
            <div key={meaning.qid} className={containerClass}>
              <p className="text-slate-700 mb-3 font-medium">
                {dataParser.getEmphasizedExample(exampleKobun, word.lemma || '') || 'データなし'}
              </p>

              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-600 mb-2">この文脈での意味を記述:</label>
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => handleAnswerChange(meaning.qid, e.target.value)}
                  disabled={checked}
                  className="w-full p-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                  placeholder="意味を入力してください"
                />
              </div>

              {/* チェック後に正解・文法エラー・スコアを表示 */}
              {checked && (
                <>
                  {/* スコア表示 */}
                  <div className={`mb-3 p-2 rounded-lg text-center font-bold ${
                    score === 100 ? 'bg-green-100 text-green-700' :
                    score === 90 ? 'bg-blue-100 text-blue-700' :
                    score === 85 ? 'bg-cyan-100 text-cyan-700' :
                    score === 75 ? 'bg-yellow-100 text-yellow-700' :
                    score === 65 ? 'bg-orange-100 text-orange-700' :
                    score === 60 ? 'bg-pink-100 text-pink-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {score}点 {result?.detail && `(${result.detail})`}
                  </div>

                  {/* 文法のヒント表示 */}
                  {grammarIssues[meaning.qid] && grammarIssues[meaning.qid].length > 0 && (
                    <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-300">
                      <p className="text-sm font-bold text-blue-700 mb-2">💡 文法のヒント:</p>
                      {grammarIssues[meaning.qid].map((issue, idx) => (
                        <div key={idx} className="text-sm text-blue-800 mb-1">
                          <span className="font-medium">{issue.token}:</span> {issue.rule}
                          {issue.where.note && <span className="block text-xs text-blue-600 ml-2">→ {issue.where.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 採点結果訂正UI - すべてのスコアで利用可能 */}
                  {userJudgment === undefined && (
                    <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-300">
                      <p className="text-sm font-medium text-blue-800 mb-2">
                        採点結果に納得できませんか？あなたの判定を選択してください
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleUserJudgment(meaning.qid, true)}
                          className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition"
                        >
                          ○ 正解
                        </button>
                        <button
                          onClick={() => handleUserJudgment(meaning.qid, false)}
                          className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition"
                        >
                          × 不正解
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ユーザー判定結果表示と取り消しボタン */}
                  {userJudgment !== undefined && (
                    <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div className={`font-bold ${
                          userJudgment ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {userJudgment ? '○ 正解と判定しました' : '× 不正解と判定しました'}
                        </div>
                        <button
                          onClick={() => setUserJudgments(prev => {
                            const next = { ...prev };
                            delete next[meaning.qid];
                            return next;
                          })}
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          取消
                        </button>
                      </div>
                      <p className="text-xs text-blue-700 mt-1">この訂正は結果に反映されます</p>
                    </div>
                  )}

                  <div className={`p-3 rounded-lg ${isCorrect ? 'bg-green-100 border border-green-300' : 'bg-yellow-50 border border-yellow-300'}`}>
                    <p className="text-sm font-medium text-slate-700 mb-1">正解:</p>
                    <p className="text-slate-900 font-bold mb-2">{correctAnswer}</p>
                    <p className="text-sm text-slate-700">{exampleModern}</p>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!checked && (
        <div className="text-center">
          <button
            onClick={handleSubmit}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            回答を提出
          </button>
        </div>
      )}

      {/* 1つでも不正解があれば次へボタン表示 */}
      {hasIncorrect && (
        <div className="text-center mt-4">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleNext();
            }}
            disabled={isSubmitting}
            className={`font-bold py-3 px-8 rounded-lg transition ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 active:scale-95'
            } text-white`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                送信中...
              </span>
            ) : '次へ'}
          </button>
        </div>
      )}

      {checked && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-4">
          <div className="text-center mb-2">
            <h3 className="text-lg font-bold text-slate-800 mb-2">結果</h3>
            <div className="text-slate-700">
              {(() => {
                const correctAnswers = word.meanings.filter(m => {
                  const result = matchResults[m.qid];
                  const issues = grammarIssues[m.qid] || [];
                  const score = result?.score || 0;
                  const userJudgment = userJudgments[m.qid];

                  console.log(`Result for ${m.qid}:`, { score, issues: issues.length, userJudgment, result });

                  // ユーザー訂正が最優先
                  if (userJudgment !== undefined) {
                    return userJudgment === true;
                  }

                  // 自動採点: 100点で文法エラーなし
                  return score === 100 && issues.length === 0;
                });
                return `${correctAnswers.length} / ${word.meanings.length} 正解`;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
