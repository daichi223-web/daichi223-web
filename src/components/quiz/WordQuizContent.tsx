import React, { useMemo, useState } from 'react';
import { Word } from '../../types';
import ExampleDisplay from '../ExampleDisplay';
import { MarkedSentence } from './MarkedSentence';
import { ChatFeedback } from './ChatFeedback';
import { dataParser } from '../../utils/dataParser';
import type { WritingJudgeResult } from '../../lib/writingJudge';
import { prepareWritingJudge } from '../../lib/writingJudgeRuntime';
import { buildThread, optionLabel } from '../../lib/quiz/chatThread';
import { TEACHERS, TEACHER_VOICE_ENABLED, teacherImage } from '../../lib/teachers';
import { useChatTeacher } from '../../lib/chatTeacher';
import { usePortraitTone } from '../../lib/portraitTone';
import { useTeacherArt } from '../../lib/teacherArt';
import { readMyStage } from '../../lib/myStage';
import {
  answerTone, hasAnswerBlank, isSubmitEnter, scrollBehavior, senseLabel,
  stripSenseBrackets, writingPrompt,
} from './writingVerdict';
import { resolveTargetSpans, type Span } from '../../lib/targetMark';
import type { ExampleContext } from '../../lib/exampleContext';

interface QuizQuestion {
  correct: Word;
  options: Word[];
  exampleIndex?: number;
  exampleKobun?: string;
  exampleModern?: string;
  senseCount?: number; // 同一 lemma の意味数（多義語判定用）
  srsBox?: number; // 単語レベル（SRS箱 1-5）
  corpusExample?: boolean; // 例文が教材実文
  resolvedType?: WordQuizType; // おまかせ時の実出題形式
  jpBlank?: string; // blank-fill: 〔　　　〕入りの例文
  exampleMark?: Span[]; // exampleKobun に付いてきた対象語の位置（実戦例文の mark）
  exampleContext?: ExampleContext; // 例文1文で意味が決まらないときの前後の本文・補足（lib/exampleContext）
  optionLabels?: Record<string, string>; // 例文の訳の活用に合わせた選択肢の文字（qid → 文字）
  retry?: boolean; // セッションの最後の「もう一度」（間違えた語の再出題。記録は進めない）
}

type WordQuizType = 'word-meaning' | 'word-reverse' | 'sentence-meaning' | 'blank-fill' | 'meaning-writing';

export interface WordQuizContentProps {
  question: QuizQuestion;
  quizType: WordQuizType;
  onAnswer: (selected: Word, correct: Word, isReverse?: boolean) => void;
  onWritingSubmit: (userAnswer: string, correctAnswer: string) => void;
  nextButtonVisible: boolean;
  onNext: () => void;
  showWritingResult: boolean;
  writingResult: WritingJudgeResult;
  writingUserJudgment?: boolean | undefined;
  handleWritingUserJudgment?: (judgment: boolean) => void;
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
  // 多義語は文脈なしでは「どの意味か」が決まらない。
  // 教材実戦例文（corpusExample）も文脈判断が前提なので、どちらも例文を最初から表示する。
  const contextRequired = (question.senseCount ?? 1) > 1 || question.corpusExample === true;
  const [userAnswer, setUserAnswer] = useState('');
  const [answeredCorrectly, setAnsweredCorrectly] = useState<boolean | null>(null);
  const [selectedOption, setSelectedOption] = useState<Word | null>(null);
  const [showExample, setShowExample] = useState(contextRequired);
  const [showModernTranslation, setShowModernTranslation] = useState(false);

  // Reset state when question changes
  // （親はもう問題ごとに unmount しないので、同じ qid で作り直された回でも残らないよう question の同一性でも走らせる）
  React.useEffect(() => {
    setAnsweredCorrectly(null);
    setSelectedOption(null);
    setUserAnswer('');
    setShowExample(contextRequired);
    setShowModernTranslation(false);
  }, [question, question.correct.qid, contextRequired]);

  // 記述は読み（かな）と教員の判断でも照合する。答える前に裏で用意しておく
  React.useEffect(() => {
    if (quizType === 'meaning-writing') prepareWritingJudge();
  }, [quizType]);

  // 正解でも自動では進まない（2026-11-02）。答え合わせは ChatFeedback に出し、タップか「つぎへ」で次へ。

  // 記述: 採点したら、判定から自己判定までが見える位置へ寄せる（動かす量は最小限）
  const verdictRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (quizType === 'meaning-writing' && showWritingResult) {
      verdictRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    }
  }, [quizType, showWritingResult]);

  // 選択肢: 答えたら、答え合わせ（自分の解答の吹き出し）が画面のいちばん上に来るまでスクロールする（2026-11-04 ユーザー指示）。
  // scroll-mt-12 で右上の固定ボタン（ホーム・教材へ）の下にそろえる。吹き出しのアニメは transform なので高さは描いた時点で決まっている
  const feedbackRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (answeredCorrectly === null) return;
    const id = window.requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [answeredCorrectly]);

  // 答え合わせ（LINE 風）の画面データ。先生と画風は端末の設定、位階は通信なしで読み、この問の間は固定（セッション中は更新しない）
  const [teacherId] = useChatTeacher();
  const [tone] = usePortraitTone();
  const [teacherArt] = useTeacherArt();
  const myStage = useMemo(readMyStage, [question?.correct?.qid]);
  const teacher = TEACHERS[teacherId];
  const teacherSrc = teacherImage(teacherId, tone, teacherArt);
  const chatMe = { stageN: myStage.n, tone, rankLabel: myStage.rank };
  // 同じ見出し語の意味の一覧（意味マップ）。getWordByLemma は多義語だけ登録されるので、単義語は []
  const siblings = useMemo(() => {
    const w = question?.correct;
    if (!w) return [];
    return (dataParser.getWordByLemma(w.lemma)?.meanings ?? []).map((m) => ({
      label: senseLabel(m),
      current: m.qid === w.qid,
    }));
  }, [question?.correct]);

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
    if (showWritingResult) return;
    onWritingSubmit(userAnswer, question.correct.qid);
  };

  const optionLabels = ['A', 'B', 'C', 'D'];

  // 見出し語の番号（単語帳の No.）。語が答えになる形式（意味→単語・空欄）は番号から語が分かるので答えたあとに出す（2026-11-04 ユーザー指示）
  const answersLemma = quizType === 'word-reverse' || quizType === 'blank-fill';
  const headwordNo = (show: boolean) =>
    show && question.correct.group ? (
      <p className="text-center mb-1">
        <span
          className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full border border-rw-rule text-rw-ink-soft bg-rw-paper"
          title={`見出し語の番号（qid ${question.correct.qid}）`}
        >
          No.{question.correct.group}
        </span>
      </p>
    ) : null;

  if (quizType === 'meaning-writing') {
    const prompt = writingPrompt(question.correct.lemma, !!question.exampleKobun);
    return (
      <div>
        {headwordNo(true)}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-black text-rw-ink leading-snug tracking-tight">{question.correct?.lemma || 'データなし'}</h2>
        </div>

        {/* Example Display */}
        <ExampleDisplay
          exampleKobun={question.exampleKobun}
          exampleModern={question.exampleModern}
          phase={showWritingResult ? 'answer' : 'question'}
          card
          className="mb-4"
          target={question.correct}
          targetSpans={question.exampleMark}
        />

        <div className="bg-rw-paper p-4 rounded-2xl border-2 border-rw-ink mb-2">
          <label className="block text-xs font-black text-rw-ink mb-1 tracking-wider">
            {prompt.label}
          </label>
          <p className="text-[11px] text-rw-ink-soft font-medium mb-2">{prompt.note}</p>
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            onKeyDown={(e) => {
              // Enter で採点。かな漢字変換の確定の Enter では採点しない
              if (!isSubmitEnter(e)) return;
              e.preventDefault();
              handleWritingSubmitClick();
            }}
            readOnly={showWritingResult}
            enterKeyHint="done"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            lang="ja"
            className={`w-full p-3 border-2 border-rw-ink rounded-xl font-serif text-base text-rw-ink outline-none focus:border-rw-primary transition-colors ${
              showWritingResult ? 'bg-rw-bg' : 'bg-rw-paper'
            }`}
            placeholder={prompt.placeholder}
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

        {/* 答え合わせ（LINE 風）。右＝書いた意味、左＝先生の判定・正解・核イメージ・罠・意味マップ。
            保留のときは先生の吹き出しの中の ○× で自己判定し、判定後も自動では進まない（タップか「つぎへ」） */}
        {showWritingResult && (() => {
          // 別義（other_sense）で書いてしまった意味の表示名
          const matched = writingResult.matchedQid
            ? dataParser.getWordByLemma(question.correct.lemma)?.meanings.find((m) => m.qid === writingResult.matchedQid)
            : undefined;
          const thread = buildThread({
            teacher: teacherId,
            word: question.correct,
            quizType,
            userAnswer,
            writingResult,
            writingUserJudgment,
            matchedSense: matched ? senseLabel(matched) : undefined,
            siblings,
            exampleKobun: question.exampleKobun,
            exampleModern: question.exampleModern,
            seed: question.correct.qid,
          voice: TEACHER_VOICE_ENABLED,
          });
          return (
            // 判定から自己判定までが見える位置へ寄せる（scrollIntoView の的）
            <div ref={verdictRef} className="scroll-mt-16 scroll-mb-4">
              <ChatFeedback
                bubbles={thread.bubbles}
                canAdvance={thread.canAdvance}
                onNext={onNext}
                teacher={teacher}
                teacherSrc={teacherSrc}
                me={chatMe}
                word={question.correct}
                exampleMark={question.exampleMark}
                onSelfJudge={handleWritingUserJudgment}
              />
            </div>
          );
        })()}

        {nextButtonVisible && (
          <div className="mt-8 text-center">
            <button
              onClick={onNext}
              className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
            >
              つぎへ →
            </button>
          </div>
        )}
      </div>
    );
  }

  // 空欄 〔　　　〕 を目立たせてレンダリング (blank-fill)
  const renderBlankSentence = (text: string) => {
    const parts = text.split(/(〔[\s　]*〕|〔[\s　]*])/);
    return parts.map((p, i) =>
      /^〔[\s　]*[〕\]]$/.test(p) ? (
        <span
          key={i}
          className="inline-block font-black px-3 mx-0.5 rounded border-b-4"
          style={{ background: 'var(--rw-pop)', opacity: 0.85, borderColor: 'var(--rw-ink)' }}
        >
          ？
        </span>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      )
    );
  };

  // 形式ごとの問いの1行（おまかせで問題ごとに形式が変わっても、何を答えるかが分かるように）
  const sentenceText = question.exampleKobun || question.correct.examples?.[0]?.jp || '';
  const isMarked = !!sentenceText && resolveTargetSpans(sentenceText, question.correct, question.exampleMark).spans.length > 0;
  const instruction =
    quizType === 'word-meaning'
      ? 'この語の意味を選ぼう'
      : quizType === 'word-reverse'
      ? 'この意味の語を選ぼう'
      : quizType === 'blank-fill'
      ? '空欄に入る語を選ぼう'
      : isMarked
      ? '印のついた語の、この文での意味を選ぼう'
      : `「${question.correct.lemma}」の、この文での意味を選ぼう`;
  // 回答前の訳は 〔 〕 の中身を伏せて出す。〔 〕 の無い訳は答えの語が見えるので、回答前は出さない
  const canHintModern = hasAnswerBlank(question.exampleModern);

  return (
    <div>
      {/* 間違えた語の再出題（セッションの最後に1回だけ） */}
      {question.retry && (
        <div className="mb-2 text-center">
          <span className="inline-block text-[11px] font-black px-3 py-1 rounded-full bg-rw-paper border border-rw-ink text-rw-ink">
            🔁 もう一度（さっき間違えた語）
          </span>
        </div>
      )}
      {/* 単語レベルが上がった語は教材の実戦例文で出題されていることを示す */}
      {question.corpusExample && (
        <div className="mb-2 text-center">
          <span className="inline-block text-[11px] font-black px-3 py-1 rounded-full bg-rw-primary-soft text-rw-primary">
            📕 教材の実戦例文 — 単語Lv{question.srsBox ?? 3}
          </span>
        </div>
      )}
      {headwordNo(!answersLemma || answeredCorrectly !== null)}
      <p className="text-xs font-black text-rw-ink tracking-wider mb-2 text-center">{instruction}</p>
      <div className="mb-3">
        {quizType === 'word-meaning' ? (
          <div className="text-center">
            <h2 className="text-3xl font-black text-rw-ink leading-snug tracking-tight">
              {question.correct?.lemma || 'データなし'}
            </h2>
          </div>
        ) : quizType === 'word-reverse' ? (
          <div className="text-center">
            <h2 className="text-2xl font-black text-rw-ink leading-snug tracking-tight mb-2">
              {stripSenseBrackets(question.correct?.sense || '') || 'データなし'}
            </h2>
            <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-5">
              <div className="font-serif text-base text-rw-ink leading-relaxed">
                {question.exampleModern || 'データなし'}
              </div>
            </div>
          </div>
        ) : quizType === 'blank-fill' ? (
          // 空欄補充 (学校テスト形式): Excel 原本の手作業空欄 + 訳がヒント
          <div>
            <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-5 mb-3">
              <div className="font-serif text-lg text-rw-ink leading-loose font-medium">
                {renderBlankSentence(question.jpBlank || '')}
              </div>
            </div>
            <div className="bg-rw-bg border border-rw-rule rounded-xl px-4 py-3">
              <p className="text-[10px] font-black text-rw-ink-soft tracking-wider mb-1">現代語訳（ヒント）</p>
              <p className="font-serif text-sm text-rw-ink leading-relaxed">
                {question.exampleModern || ''}
              </p>
            </div>
          </div>
        ) : (
          // sentence-meaning: 古文を paper card で表示して、問われている語に印を付ける
          // 例文1文で意味が決まらないときは、前後の本文を薄く添え、補足を下に出す（例文そのものは変えない。2026-11-05）
          <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-5">
            <div className="font-serif text-lg text-rw-ink leading-loose font-medium">
              {question.exampleContext?.before && (
                <span className="text-rw-ink-soft font-normal">…{question.exampleContext.before}</span>
              )}
              {(() => {
                // 後ろの本文は末尾の（出典）の前に入れる。印の位置は文頭からの文字数なので、末尾を切っても変わらない
                const full = question.exampleKobun || question.correct.examples?.[0]?.jp || 'データなし';
                const after = question.exampleContext?.after;
                const m = after ? full.match(/^([\s\S]*?)\s*([（(][^（）()]*[）)])$/) : null;
                const body = m ? m[1] : full;
                return (
                  <>
                    <MarkedSentence text={body} word={question.correct} spans={question.exampleMark} />
                    {after && <span className="text-rw-ink-soft font-normal">{after}…</span>}
                    {m && <span>{m[2]}</span>}
                  </>
                );
              })()}
            </div>
            {question.exampleContext?.note && (
              <p className="mt-2 pt-2 border-t border-dashed border-rw-rule text-[12px] font-bold text-rw-ink-soft">
                場面：{question.exampleContext.note}
              </p>
            )}
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
              ヒント：例文
            </button>
          ) : (
            <>
              <ExampleDisplay
                exampleKobun={question.exampleKobun}
                exampleModern={question.exampleModern}
                showKobun={true}
                showModern={showModernTranslation}
                forceShowModern={showModernTranslation}
                maskAnswer
                phase={answeredCorrectly !== null ? 'answer' : 'question'}
                target={question.correct}
                targetSpans={question.exampleMark}
              />
              {canHintModern && !showModernTranslation && answeredCorrectly === null && (
                <button
                  onClick={() => setShowModernTranslation(true)}
                  className="w-full mt-2 py-2 px-4 bg-rw-paper border-2 border-rw-rule text-rw-ink-soft font-black rounded-full transition hover:border-rw-ink-soft text-sm"
                >
                  ヒント：現代語訳
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* sentence-meaning: 印が付かない例文では、指示文に見出し語が入っているので重ねて出さない。
          不正解時の訳は答え合わせの吹き出し（例文）に出す */}
      {quizType === 'sentence-meaning' && isMarked && (
        <div className="text-center mb-2">
          <p className="text-xs text-rw-ink-soft font-black tracking-wider">参考：見出し語</p>
          <p className="text-rw-ink font-black">{question.correct?.lemma || ''}</p>
        </div>
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
          // 回答後: 薄い地＋濃い文字＋太い枠。丸の中は記号（正解 ○・選んだ誤答 ×）にして、色だけに頼らない
          let tone: React.CSSProperties | undefined;
          let label = optionLabels[index];

          if (answered) {
            buttonClass += ' pointer-events-none';
            if (isCorrectOption) {
              buttonClass += ' text-rw-ink font-black';
              labelBg = 'bg-rw-paper text-rw-ink';
              tone = answerTone('var(--rw-ok)');
              label = '○';
            } else if (isSelectedWrong) {
              buttonClass += ' text-rw-ink font-black';
              labelBg = 'bg-rw-paper text-rw-ink';
              tone = answerTone('var(--rw-ng)');
              label = '×';
            } else {
              buttonClass += ' bg-rw-paper border-rw-rule text-rw-ink-soft';
            }
          } else {
            buttonClass += ' bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-ink-soft';
          }

          return (
            <button
              key={option.qid}
              onClick={() => handleOptionClick(option)}
              className={buttonClass}
              style={{ minHeight: '44px', ...tone }}
            >
              <span className={`inline-flex items-center justify-center w-7 h-7 mr-3 rounded-full font-black text-sm flex-shrink-0 ${labelBg}`}>
                {label}
              </span>
              <span className="flex-1">
                {question.optionLabels?.[option.qid] ?? optionLabel(option, quizType)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 答え合わせ（LINE 風）。右＝選んだ答え、左＝先生の判定・核イメージ・罠・例文と訳・意味マップ。
          正解でも自動では進まず、タップか「つぎへ」で次へ（blank-fill の例文は空欄が埋まった全文 exampleKobun） */}
      {answeredCorrectly !== null && (() => {
        const thread = buildThread({
          teacher: teacherId,
          word: question.correct,
          quizType,
          selected: selectedOption,
          optionLabels: question.optionLabels,
          isCorrect: answeredCorrectly,
          siblings,
          exampleKobun: question.exampleKobun,
          exampleModern: question.exampleModern,
          seed: question.correct.qid,
          voice: TEACHER_VOICE_ENABLED,
        });
        return (
          // 最低の高さ＝画面の高さ − 上の余白。答え合わせが短くてもページの下が足りず上端まで上がらない、を防ぐ
          <div ref={feedbackRef} className="scroll-mt-12" style={{ minHeight: 'calc(100dvh - 3rem)' }}>
            <ChatFeedback
              bubbles={thread.bubbles}
              canAdvance={thread.canAdvance}
              onNext={onNext}
              teacher={teacher}
              teacherSrc={teacherSrc}
              me={chatMe}
              word={question.correct}
              exampleMark={question.exampleMark}
            />
            <div className="mt-8 text-center">
              <button
                onClick={onNext}
                className="bg-rw-ink text-rw-paper font-black rounded-full px-8 py-3 tracking-widest transition-transform hover:-translate-y-0.5"
                style={{ boxShadow: '0 4px 0 var(--rw-primary)' }}
              >
                つぎへ →
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
