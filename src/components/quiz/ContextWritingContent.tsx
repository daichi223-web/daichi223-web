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

  // スコアに応じた色を返す（CSS variables）
  const getScoreColor = (score: number) => {
    if (score === 100) return 'var(--rw-accent)';
    if (score >= 85) return 'var(--rw-primary)';
    if (score >= 65) return 'var(--rw-pop)';
    if (score >= 60) return 'var(--rw-tertiary)';
    return 'var(--rw-primary)';
  };

  return (
    <div>
      <div className="text-center mb-4">
        <p className="text-xs font-black text-rw-ink-soft tracking-widest mb-1">参考：見出し語</p>
        <p className="text-2xl font-black text-rw-ink tracking-tight">{word.lemma}</p>
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

              <div className="mb-3">
                <label className="block text-xs font-black text-rw-ink-soft tracking-wider mb-2">この文脈での意味をかいてね</label>
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => handleAnswerChange(meaning.qid, e.target.value)}
                  disabled={checked}
                  className="w-full p-3 bg-rw-paper border-2 border-rw-ink rounded-xl font-serif text-base text-rw-ink outline-none focus:border-rw-primary transition-colors disabled:opacity-70"
                  placeholder="意味を入力してください"
                />
              </div>

              {/* チェック後に正解・文法エラー・スコアを表示 */}
              {checked && (
                <>
                  {/* スコア表示 */}
                  <div
                    className="mb-3 p-3 rounded-xl text-center font-black text-rw-paper"
                    style={{ background: getScoreColor(score) }}
                  >
                    {score}<span className="text-sm font-bold ml-1">点</span> {result?.detail && <span className="text-sm font-medium ml-1">({result.detail})</span>}
                  </div>

                  {/* 文法のヒント表示 */}
                  {grammarIssues[meaning.qid] && grammarIssues[meaning.qid].length > 0 && (
                    <div className="mb-3 p-4 rounded-xl bg-rw-primary-soft border-l-4 border-rw-primary">
                      <p className="text-sm font-black text-rw-primary mb-2 tracking-wider">文法のヒント</p>
                      {grammarIssues[meaning.qid].map((issue, idx) => (
                        <div key={idx} className="text-sm text-rw-ink mb-1">
                          <span className="font-black">{issue.token}:</span> {issue.rule}
                          {issue.where.note && <span className="block text-xs text-rw-ink-soft ml-2 mt-1">→ {issue.where.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 採点結果訂正UI - すべてのスコアで利用可能 */}
                  {userJudgment === undefined && (
                    <div className="mb-3 p-4 rounded-xl bg-rw-paper border-2 border-rw-rule">
                      <p className="text-sm font-black text-rw-ink mb-3 text-center">
                        採点結果に納得できないときは判定してね
                      </p>
                      <div className="flex gap-2 justify-center flex-wrap">
                        <button
                          onClick={() => handleUserJudgment(meaning.qid, true)}
                          className="px-6 py-2 bg-rw-accent text-rw-paper border-2 border-rw-accent font-black rounded-full transition hover:-translate-y-0.5"
                        >
                          ○ 正解
                        </button>
                        <button
                          onClick={() => handleUserJudgment(meaning.qid, false)}
                          className="px-6 py-2 bg-rw-primary text-rw-paper border-2 border-rw-primary font-black rounded-full transition hover:-translate-y-0.5"
                        >
                          × 不正解
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ユーザー判定結果表示と取り消しボタン */}
                  {userJudgment !== undefined && (
                    <div className="mb-3 p-3 rounded-xl bg-rw-paper border-2 border-rw-rule">
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className="font-black"
                          style={{ color: userJudgment ? 'var(--rw-accent)' : 'var(--rw-primary)' }}
                        >
                          {userJudgment ? '○ 正解と判定しました' : '× 不正解と判定しました'}
                        </div>
                        <button
                          onClick={() => setUserJudgments(prev => {
                            const next = { ...prev };
                            delete next[meaning.qid];
                            return next;
                          })}
                          className="text-sm text-rw-ink-soft hover:text-rw-ink underline font-bold"
                        >
                          取消
                        </button>
                      </div>
                      <p className="text-xs text-rw-ink-soft mt-1 font-medium">この訂正は結果に反映されます</p>
                    </div>
                  )}

                  <div
                    className={`p-4 rounded-xl border-2 ${
                      isCorrect ? 'bg-rw-paper border-rw-accent' : 'bg-rw-paper border-rw-pop'
                    }`}
                  >
                    <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-1">正解</p>
                    <p className="text-rw-ink font-black text-base mb-2">{correctAnswer}</p>
                    <p className="text-sm text-rw-ink-soft font-serif">{exampleModern}</p>
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
            className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
          >
            採点する
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
            className={`font-black rounded-full px-8 py-3 tracking-widest transition-transform ${
              isSubmitting
                ? 'bg-rw-ink-soft text-rw-paper cursor-not-allowed opacity-70'
                : 'bg-rw-primary text-rw-paper hover:-translate-y-0.5'
            }`}
            style={!isSubmitting ? { boxShadow: '0 4px 0 var(--rw-ink)' } : undefined}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-rw-paper" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                送信中...
              </span>
            ) : 'つぎへ'}
          </button>
        </div>
      )}

      {checked && (
        <div className="bg-rw-paper p-6 rounded-2xl border-2 border-rw-ink mb-4">
          <div className="text-center mb-2">
            <h3 className="text-xs font-black text-rw-ink-soft tracking-widest mb-2">結果</h3>
            <div className="text-rw-ink font-black text-2xl tracking-tight">
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
