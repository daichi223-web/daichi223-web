import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MultiMeaningWord } from '../../types';
import { dataParser } from '../../utils/dataParser';
import type { WritingJudgeResult } from '../../lib/writingJudge';
import { judgeWritingAnswer, prepareWritingJudge, toAutoFields } from '../../lib/writingJudgeRuntime';
import { coachWriting, isCoachOptedIn } from '../../lib/nanoCoach';
import { MarkedSentence } from './MarkedSentence';
import { PolysemyInsight } from './WordInsightPanel';
import { SenseAnswerGuide } from './SenseAnswerGuide';
import {
  isSubmitEnter, quizMeanings, scrollBehavior, selfJudgePrompt, senseLabel, softTone,
  writingHeadline, writingPrompt,
} from './writingVerdict';

export interface ContextWritingJudged {
  qid: string;
  result: WritingJudgeResult;
  /** 最終の正誤。保留のまま進んだ意味は null（記録しない） */
  final: boolean | null;
}

export interface ContextWritingContentProps {
  word: MultiMeaningWord;
  exampleIndex: number;
  /** 「つぎへ」で確定した判定を、意味ごとに1回だけ渡す */
  onJudged: (results: ContextWritingJudged[]) => void;
  onNext: () => void;
}

export function ContextWritingContent({
  word,
  onJudged,
  onNext,
}: ContextWritingContentProps) {
  const [answers, setAnswers] = useState<{[key: string]: string}>({});
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<{[key: string]: WritingJudgeResult}>({});
  const [userJudgments, setUserJudgments] = useState<{[key: string]: boolean}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coachComments, setCoachComments] = useState<{[key: string]: string}>({});
  const [coachLoading, setCoachLoading] = useState<{[key: string]: boolean}>({});
  const coachFiredRef = useRef<boolean>(false);
  const submittedRef = useRef<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const firstCardRef = useRef<HTMLDivElement | null>(null);

  // 画面に出して採点する意味（例文のあるもの）。例文の無い意味はカードを出さず、採点・記録もしない
  const meanings = useMemo(() => quizMeanings(word), [word]);

  // 記述は読み（かな）と教員の判断でも照合する。答える前に裏で用意しておく
  useEffect(() => {
    prepareWritingJudge();
  }, []);

  // Reset answers when word changes
  React.useEffect(() => {
    setAnswers({});
    setChecked(false);
    setResults({});
    setUserJudgments({});
    setIsSubmitting(false);
    setCoachComments({});
    setCoachLoading({});
    coachFiredRef.current = false;
    submittedRef.current = false;
  }, [word.lemma]);

  const handleAnswerChange = (meaningQid: string, value: string) => {
    if (checked) return;
    setAnswers(prev => ({ ...prev, [meaningQid]: value }));
  };

  const handleSubmit = () => {
    if (checked) return;

    const next: {[key: string]: WritingJudgeResult} = {};
    meanings.forEach(meaning => {
      const userAnswer = (answers[meaning.qid] || '').trim();
      next[meaning.qid] = judgeWritingAnswer(userAnswer, meaning, word.meanings);
    });

    setResults(next);
    setChecked(true);
  };

  // Enter で次の入力欄へ。最後の欄では採点する（かな漢字変換の確定の Enter は除く）
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (!isSubmitEnter(e)) return;
    e.preventDefault();
    if (checked) return;
    const nextInput = inputRefs.current[index + 1];
    if (index < meanings.length - 1 && nextInput) {
      nextInput.focus();
    } else {
      handleSubmit();
    }
  };

  // 採点したら1枚目のカードが見える位置へ戻す
  useEffect(() => {
    if (checked) firstCardRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, [checked]);

  // 最終の正誤。機械で決まったものはそのまま、保留は自己判定（未判定なら null）
  const finalOf = useCallback((qid: string): boolean | null => {
    const result = results[qid];
    if (!result) return null;
    if (result.verdict === 'correct') return true;
    if (result.verdict === 'pending') return userJudgments[qid] ?? null;
    return false;
  }, [results, userJudgments]);

  const handleNext = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setIsSubmitting(true);

    try {
      onJudged(meanings.map(m => ({ qid: m.qid, result: results[m.qid], final: finalOf(m.qid) })));

      const anonId = localStorage.getItem('anonId') || `anon_${Date.now()}`;
      if (!localStorage.getItem('anonId')) {
        localStorage.setItem('anonId', anonId);
      }

      // 回答の本文を意味ごとに保存。保留を自己判定したものは、その判定も残す
      const submitPromises = meanings.map(async (meaning) => {
        const userAnswer = (answers[meaning.qid] || '').trim();
        const result = results[meaning.qid];
        if (!userAnswer || !result) return;

        try {
          const response = await fetch('/api/submitAnswer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qid: meaning.qid,
              answerRaw: userAnswer,
              anonId,
              ...toAutoFields(result),
              questionType: 'writing',
            }),
          });
          const judgment = userJudgments[meaning.qid];
          if (result.verdict !== 'pending' || judgment === undefined) return;

          const data = await response.json();
          if (data.answerId) {
            await fetch('/api/userCorrectAnswer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                answerId: data.answerId,
                userCorrection: judgment ? 'OK' : 'NG',
                userId: anonId,
              }),
            });
          }
        } catch (e) {
          console.error(`Failed to submit answer for ${meaning.qid}:`, e);
        }
      });

      await Promise.all(submitPromises);

      onNext();
    } finally {
      setIsSubmitting(false);
    }
  }, [meanings, results, userJudgments, answers, finalOf, onJudged, onNext]);

  // AI コーチ: 機械で決まらなかった（保留の）意味だけに対して
  // Nano にコメントを依頼。判定には影響させない。
  useEffect(() => {
    if (!checked) return;
    if (coachFiredRef.current) return;
    if (!isCoachOptedIn()) return;
    coachFiredRef.current = true;

    meanings.forEach(async (meaning) => {
      if (results[meaning.qid]?.verdict !== 'pending') return;
      const userAnswer = (answers[meaning.qid] || '').trim();
      if (!userAnswer) return;
      const examples = dataParser.getExamplesForSense(meaning, meaning.qid, word);
      const exampleKobun = examples.kobun[0] || meaning.examples?.[0]?.jp || '';

      setCoachLoading((prev) => ({ ...prev, [meaning.qid]: true }));
      const comment = await coachWriting({
        kobun: exampleKobun,
        lemma: word.lemma,
        modelAnswer: senseLabel(meaning),
        userAnswer,
      });
      setCoachLoading((prev) => {
        const next = { ...prev };
        delete next[meaning.qid];
        return next;
      });
      if (comment) {
        setCoachComments((prev) => ({ ...prev, [meaning.qid]: comment }));
      }
    });
  }, [checked, word, meanings, results, answers]);

  const allCorrect = checked && meanings.length > 0 && meanings.every(m => results[m.qid]?.verdict === 'correct');
  const blankCount = meanings.filter(m => !(answers[m.qid] || '').trim()).length;

  // 全部正解のときだけ自動遷移
  useEffect(() => {
    if (!allCorrect) return;
    const timer = setTimeout(() => {
      handleNext();
    }, 2000);
    return () => clearTimeout(timer);
  }, [allCorrect, handleNext]);

  return (
    <div>
      <div className="text-center mb-4">
        <p className="text-xs font-black text-rw-ink-soft tracking-widest mb-1">参考：見出し語</p>
        <p className="text-2xl font-black text-rw-ink tracking-tight">{word.lemma}</p>
      </div>

      <div className="space-y-4 mb-4">
        {meanings.map((meaning, index) => {
          const userAnswer = answers[meaning.qid] || '';
          const result = results[meaning.qid];
          const isCorrect = result?.verdict === 'correct';
          const pending = result?.verdict === 'pending';
          const userJudgment = userJudgments[meaning.qid];
          const matched = result?.matchedQid
            ? word.meanings.find(m => m.qid === result.matchedQid)
            : undefined;

          // Get sense-priority examples for this meaning
          const examples = dataParser.getExamplesForSense(meaning, meaning.qid, word);
          const exampleKobun = examples.kobun[0] || meaning.examples?.[0]?.jp || '';
          const exampleModern = examples.modern[0] || meaning.examples?.[0]?.translation || '';
          const prompt = writingPrompt(word.lemma, !!exampleKobun);

          let containerClass = 'p-5 rounded-2xl border-2 scroll-mt-16';
          if (checked) {
            containerClass += isCorrect
              ? ' bg-rw-accent-soft border-rw-accent'
              : pending
              ? ' bg-rw-paper border-rw-rule'
              : ' bg-rw-primary-soft border-rw-primary';
          } else {
            containerClass += ' bg-rw-paper border-rw-ink';
          }

          return (
            <div key={meaning.qid} ref={index === 0 ? firstCardRef : undefined} className={containerClass}>
              <p className="text-rw-ink font-serif text-base leading-relaxed mb-3">
                <MarkedSentence text={exampleKobun} word={meaning} />
              </p>

              <div className="mb-3">
                <label className="block text-xs font-black text-rw-ink-soft tracking-wider mb-1">{prompt.label}</label>
                <p className="text-[11px] text-rw-ink-soft font-medium mb-2">{prompt.note}</p>
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => handleAnswerChange(meaning.qid, e.target.value)}
                  onKeyDown={(e) => handleInputKeyDown(e, index)}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  readOnly={checked}
                  enterKeyHint={index < meanings.length - 1 ? 'next' : 'done'}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  lang="ja"
                  className={`w-full p-3 border-2 border-rw-ink rounded-xl font-serif text-base text-rw-ink outline-none focus:border-rw-primary transition-colors ${
                    checked ? 'bg-rw-bg' : 'bg-rw-paper'
                  }`}
                  placeholder={prompt.placeholder}
                />
              </div>

              {/* チェック後に判定・正解を表示 */}
              {checked && result && (
                <>
                  {/* 判定: 点数ではなく「どの意味で読んだか」 */}
                  {(() => {
                    const head = writingHeadline(result);
                    return (
                      <div
                        className="mb-3 p-3 rounded-xl border-2 text-center font-black text-rw-ink"
                        style={softTone(head.color)}
                      >
                        {head.mark} {head.text}
                      </div>
                    );
                  })()}

                  {matched && (
                    <p className="mb-3 text-sm text-rw-ink leading-relaxed font-semibold">
                      書いたのは「{senseLabel(matched)}」の意味。この文脈では「{senseLabel(meaning)}」。
                    </p>
                  )}

                  {/* AI コーチコメント (オプトイン時・保留のみ) */}
                  {(coachLoading[meaning.qid] || coachComments[meaning.qid]) && (
                    <div className="mb-3 p-4 rounded-xl bg-rw-paper border-2 border-dashed border-rw-tertiary">
                      <p className="text-xs font-black text-rw-tertiary tracking-wider mb-2">
                        🤖 AI コーチ
                      </p>
                      {coachLoading[meaning.qid] ? (
                        <p className="text-sm text-rw-ink-soft">考え中…</p>
                      ) : (
                        <p className="text-sm text-rw-ink whitespace-pre-wrap">
                          {coachComments[meaning.qid]}
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    className={`p-4 rounded-xl border-2 ${
                      isCorrect ? 'bg-rw-paper border-rw-accent' : 'bg-rw-paper border-rw-pop'
                    }`}
                  >
                    <p className="text-xs font-black text-rw-ink-soft tracking-wider mb-1">正解</p>
                    <SenseAnswerGuide word={meaning} className="text-rw-ink font-black text-base" />
                    <p className="text-sm text-rw-ink-soft font-serif mt-2">{exampleModern}</p>
                  </div>

                  {/* 自己判定: 機械で決まらなかったときだけ。正解の枠のすぐ下に置く */}
                  {pending && userJudgment === undefined && (
                    <div className="mt-3 p-4 rounded-xl bg-rw-paper border-2 border-rw-rule">
                      <p className="text-sm font-black text-rw-ink mb-3 text-center">
                        {selfJudgePrompt(meaning)}
                      </p>
                      <div className="flex gap-2 justify-center flex-wrap">
                        <button
                          onClick={() => setUserJudgments(prev => ({ ...prev, [meaning.qid]: true }))}
                          className="px-4 py-2 text-rw-ink border-2 font-black rounded-full transition hover:-translate-y-0.5"
                          style={softTone('var(--rw-accent)')}
                        >
                          ○ 合っていた
                        </button>
                        <button
                          onClick={() => setUserJudgments(prev => ({ ...prev, [meaning.qid]: false }))}
                          className="px-4 py-2 text-rw-ink border-2 font-black rounded-full transition hover:-translate-y-0.5"
                          style={softTone('var(--rw-primary)')}
                        >
                          × ちがった
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 自己判定の結果と取り消し */}
                  {pending && userJudgment !== undefined && (
                    <div
                      className="mt-3 p-3 rounded-xl border-2"
                      style={softTone(userJudgment ? 'var(--rw-accent)' : 'var(--rw-primary)')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-black text-rw-ink">
                          {userJudgment ? '○ 合っていたと判定しました' : '× ちがったと判定しました'}
                        </div>
                        <button
                          onClick={() => setUserJudgments(prev => {
                            const next = { ...prev };
                            delete next[meaning.qid];
                            return next;
                          })}
                          className="text-sm text-rw-ink underline font-bold"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {!checked && (
        <div className="text-center">
          {/* 未入力があっても採点はできる。数だけ知らせる */}
          {blankCount > 0 && (
            <p className="text-xs font-black text-rw-ink tracking-wider mb-3">未入力 {blankCount}件</p>
          )}
          <button
            onClick={handleSubmit}
            className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
          >
            採点する
          </button>
        </div>
      )}

      {/* 採点後: 核イメージ＋意味ごとの決め手で1つの絵にまとめる */}
      {checked && <PolysemyInsight meanings={word.meanings} className="mb-4" />}

      {/* 結果は「つぎへ」より上に置く（押す前に目に入るように） */}
      {checked && (
        <div className="bg-rw-paper p-6 rounded-2xl border-2 border-rw-ink mb-4">
          <div className="text-center mb-2">
            <h3 className="text-xs font-black text-rw-ink-soft tracking-widest mb-2">結果</h3>
            <div className="text-rw-ink font-black text-2xl tracking-tight">
              {meanings.filter(m => finalOf(m.qid) === true).length} / {meanings.length} 正解
            </div>
            {meanings.some(m => finalOf(m.qid) === null) && (
              <p className="text-xs text-rw-ink-soft mt-1 font-medium">
                まだ判定していない答えがあります（判定しないで進むと、その語は記録されません）
              </p>
            )}
          </div>
        </div>
      )}

      {/* 全部正解なら自動で進む。それ以外は次へボタン表示 */}
      {checked && !allCorrect && (
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
                : 'bg-rw-ink text-rw-paper hover:-translate-y-0.5'
            }`}
            style={!isSubmitting ? { boxShadow: '0 4px 0 var(--rw-primary)' } : undefined}
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
    </div>
  );
}
