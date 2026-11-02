import { useMemo, type KeyboardEvent } from 'react';
import type { Word } from '../../types';
import type { ChatBubble, ChatVerdict } from '../../lib/quiz/chatThread';
import type { TeacherMeta } from '../../lib/teachers';
import type { PortraitTone } from '../../lib/portraitTone';
import { FaceAvatar } from '../noble/FaceAvatar';
import { MarkedSentence } from './MarkedSentence';
import { SenseAnswerGuide } from './SenseAnswerGuide';
import { softTone } from './writingVerdict';

// 単語クイズの答え合わせ（LINE 風）。
// 右＝自分（選んだ答え・書いた意味）、左＝先生（判定・正解・核イメージ・罠・例文と訳・意味マップ）。
// 何を出すかは lib/quiz/chatThread.ts の buildThread が決め、ここは描くだけ。
// canAdvance のときは全体がタップ（Enter / Space）で次の問へ。中のボタン（自己判定の ○×）は伝播を止める。

export interface ChatFeedbackProps {
  bubbles: ChatBubble[];
  canAdvance: boolean;
  onNext: () => void;
  /** 左のアイコンと名前 */
  teacher: TeacherMeta;
  teacherSrc: string;
  /** 右のアイコン（位階の肖像から顔を丸く切る）と名前 */
  me: { stageN: number; tone: PortraitTone; rankLabel: string };
  /** answerGuide / example の描画に使う */
  word: Word;
  /** MarkedSentence 用（question.exampleMark） */
  exampleMark?: [number, number][];
  /** selfJudge の ○× */
  onSelfJudge?: (ok: boolean) => void;
}

const AVATAR_PX = 36;
/** 吹き出しを1つずつ出す間隔 */
const STAGGER_MS = 80;

const BUBBLE_BASE = 'border px-3 py-2 text-[13px] leading-relaxed break-words';
const ME_BUBBLE = `${BUBBLE_BASE} rounded-2xl rounded-tr-md bg-rw-primary-soft border-rw-primary text-rw-ink`;

// 先生の吹き出しの地の色は種類で変える（核イメージ＝accent、罠＝primary、それ以外＝紙）
function teacherBubbleClass(kind: ChatBubble['kind']): string {
  const shape = `${BUBBLE_BASE} rounded-2xl rounded-tl-md`;
  if (kind === 'core') return `${shape} bg-rw-accent-soft border-rw-accent text-rw-ink`;
  if (kind === 'trap') return `${shape} bg-rw-primary-soft border-rw-primary text-rw-primary font-bold`;
  return `${shape} bg-rw-paper border-rw-rule text-rw-ink`;
}

// 判定の吹き出しの先頭に付ける印。色だけに頼らない（記号と色は writingHeadline と同じ）
const VERDICT_MARK: Record<ChatVerdict, { mark: string; color: string }> = {
  ok: { mark: '○', color: 'var(--rw-accent)' },
  ng: { mark: '×', color: 'var(--rw-primary)' },
  near: { mark: '△', color: 'var(--rw-pop)' },
  pending: { mark: '？', color: 'var(--rw-ink-soft)' },
};

const JUDGE_BUTTON = 'px-4 py-2 text-rw-ink border-2 font-black rounded-full transition hover:-translate-y-0.5';

function BubbleBody({
  bubble,
  word,
  exampleMark,
  onSelfJudge,
}: {
  bubble: ChatBubble;
  word: Word;
  exampleMark?: [number, number][];
  onSelfJudge?: (ok: boolean) => void;
}): JSX.Element | null {
  switch (bubble.kind) {
    case 'answer':
    case 'text':
      return <span className="whitespace-pre-wrap">{bubble.text}</span>;
    case 'verdict': {
      const { mark, color } = VERDICT_MARK[bubble.verdict];
      return (
        <span className="whitespace-pre-wrap">
          <span className="font-black mr-1" style={{ color }}>{mark}</span>
          {bubble.text}
        </span>
      );
    }
    case 'answerGuide':
      // 「正解は」などは付けず、記述の正解欄（どこまで書けば○か）をそのまま入れる
      return <SenseAnswerGuide word={word} className="font-serif font-bold" />;
    case 'core':
      return (
        <div>
          <p>{bubble.lead}</p>
          <p className="mt-0.5 font-semibold">
            🧭 <b>{bubble.lemma}</b>＝{bubble.core}
          </p>
          {bubble.decider && (
            <p className="mt-0.5">
              🔑 {bubble.decider.clue} → {bubble.decider.rule}
            </p>
          )}
          {bubble.trapModern && (
            <p className="mt-0.5 text-rw-primary font-bold">⚠ 現代語「{bubble.trapModern}」と混同しない</p>
          )}
        </div>
      );
    case 'trap':
      return (
        <div>
          <p>{bubble.lead}</p>
          <p className="mt-0.5">
            ⚠ 現代語「{bubble.modern}」の罠{bubble.note ? ` — ${bubble.note}` : ''}
          </p>
        </div>
      );
    case 'example':
      return (
        <div>
          <p>{bubble.lead}</p>
          {bubble.kobun && (
            <p className="mt-0.5 font-serif text-[14px] leading-loose">
              <MarkedSentence text={bubble.kobun} word={word} spans={exampleMark} />
            </p>
          )}
          {bubble.modern && (
            <p className="mt-0.5">
              {bubble.kobun ? '→ ' : '訳：'}
              {bubble.modern}
            </p>
          )}
        </div>
      );
    case 'senses':
      return (
        <div>
          <p className="text-[11px] font-black text-rw-ink-soft tracking-wider">「{word.lemma}」の意味（全部で{bubble.items.length}つ）</p>
          {/* 意味は1つずつ大きな丸で区切る。小さな「・」だと「〜ている（補助）」のような意味が説明文に見えてしまう（2026-11-02 ユーザー指摘） */}
          <ul className="mt-1 space-y-1">
            {bubble.items.map((item, i) => (
              <li key={i} className={`flex items-start gap-2 ${item.current ? 'font-black text-rw-ink' : 'text-rw-ink'}`}>
                <span
                  aria-hidden="true"
                  className="shrink-0 mt-[0.2em] w-[1em] h-[1em] rounded-full border-2"
                  style={{
                    borderColor: item.current ? 'var(--rw-primary)' : 'var(--rw-ink-soft)',
                    background: item.current ? 'var(--rw-primary)' : 'transparent',
                  }}
                />
                <span>
                  {item.label}
                  {item.current && (
                    <span
                      className="ml-1.5 inline-block px-1.5 py-px rounded-full text-[10px] font-black align-[0.1em]"
                      style={{ background: 'var(--rw-primary)', color: 'var(--rw-paper)' }}
                    >
                      この文
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'selfJudge':
      return (
        <div>
          <p className="font-black">{bubble.text}</p>
          <div className="flex gap-2 flex-wrap mt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelfJudge?.(true);
              }}
              className={JUDGE_BUTTON}
              style={softTone('var(--rw-accent)')}
            >
              ○ 合っていた
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelfJudge?.(false);
              }}
              className={JUDGE_BUTTON}
              style={softTone('var(--rw-primary)')}
            >
              × ちがった
            </button>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function ChatFeedback({
  bubbles,
  canAdvance,
  onNext,
  teacher,
  teacherSrc,
  me,
  word,
  exampleMark,
  onSelfJudge,
}: ChatFeedbackProps) {
  // key は「どちら側＋種類＋何番目か」。自己判定のあとで吹き出しが入れ替わっても、残る吹き出しはアニメし直さない
  const rows = useMemo(() => {
    const seen: Partial<Record<ChatBubble['kind'], number>> = {};
    return bubbles.map((bubble) => {
      const n = (seen[bubble.kind] ?? 0) + 1;
      seen[bubble.kind] = n;
      return { bubble, key: `${bubble.side}-${bubble.kind}-${n}` };
    });
  }, [bubbles]);

  const advanceProps = canAdvance
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: onNext,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNext();
          }
        },
      }
    : {};

  return (
    <div
      className={`mt-4 pt-3 border-t border-rw-rule focus:outline-none focus-visible:ring-2 focus-visible:ring-rw-primary ${
        canAdvance ? 'cursor-pointer' : ''
      }`}
      {...advanceProps}
    >
      <div aria-live="polite" className="flex flex-col gap-2.5">
        {rows.map(({ bubble, key }, i) => {
          const isMe = bubble.side === 'me';
          return (
            // 外側は overflow hidden（せり上がりの途中を隠す）。アイコンの枠（box-shadow 2px）が切れないよう 3px 外に広げる
            <div key={key} className="overflow-hidden" style={{ margin: -3, padding: 3 }}>
              <div
                className={`flex items-start gap-2 animate-slide-up ${isMe ? 'justify-end' : ''}`}
                style={{ animationDelay: `${i * STAGGER_MS}ms`, animationFillMode: 'backwards' }}
              >
                {!isMe && <FaceAvatar src={teacherSrc} size={AVATAR_PX} alt={teacher.name} className="mt-4" />}
                <div className={`flex flex-col min-w-0 max-w-[82%] ${isMe ? 'items-end' : 'items-start'}`}>
                  <p className={`text-[10px] font-black text-rw-ink-soft mb-0.5 ${isMe ? 'mr-1' : 'ml-1'}`}>
                    {isMe ? `${me.rankLabel} ・ あなた` : teacher.name}
                  </p>
                  <div className={isMe ? ME_BUBBLE : teacherBubbleClass(bubble.kind)}>
                    <BubbleBody bubble={bubble} word={word} exampleMark={exampleMark} onSelfJudge={onSelfJudge} />
                  </div>
                </div>
                {isMe && (
                  <FaceAvatar
                    stageN={me.stageN}
                    tone={me.tone}
                    size={AVATAR_PX}
                    alt={`あなた（${me.rankLabel}）`}
                    className="mt-4"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {canAdvance && (
        <p className="mt-3 text-right text-[12px] font-black text-rw-ink-soft">▶ タップで次の問へ</p>
      )}
    </div>
  );
}

export default ChatFeedback;
