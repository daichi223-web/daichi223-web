import type { ReactNode } from 'react';

// 会話（LINE 風）の1行。左＝先生、右＝自分。
// 見た目は単語クイズの答え合わせ（ChatFeedback.tsx）と同じ式：吹き出しの形・色・名前の位置・アイコンの位置・せり上がり。
// ChatFeedback は答え合わせ専用の中身（判定・自己判定など）を持つので、ほかの画面（単語カード）はこの部品で同じ見た目を組む。
// 見た目を変えるときは ChatFeedback の BUBBLE_BASE・ME_BUBBLE・teacherBubbleClass と一緒に直す。

/** 先生の吹き出しの地の色。core＝核イメージ・理由（accent）、trap＝現代語の罠（primary）、plain＝紙 */
export type ChatRowTone = 'plain' | 'core' | 'trap';

export const CHAT_AVATAR_PX = 36;

const BUBBLE_BASE = 'border px-3 py-2 text-[13px] leading-relaxed break-words';
const ME_BUBBLE = `${BUBBLE_BASE} rounded-2xl rounded-tr-md bg-rw-primary-soft border-rw-primary text-rw-ink`;

function teacherBubble(tone: ChatRowTone): string {
  const shape = `${BUBBLE_BASE} rounded-2xl rounded-tl-md`;
  if (tone === 'core') return `${shape} bg-rw-accent-soft border-rw-accent text-rw-ink`;
  if (tone === 'trap') return `${shape} bg-rw-primary-soft border-rw-primary text-rw-primary font-bold`;
  return `${shape} bg-rw-paper border-rw-rule text-rw-ink`;
}

export interface ChatRowProps {
  side: 'teacher' | 'me';
  /** 吹き出しの上に出す名前（先生の名前／「位階 ・ あなた」） */
  name: string;
  /** 丸いアイコン（FaceAvatar）。ChatFeedback と同じく吹き出しの上端より少し下げて置く */
  avatar: ReactNode;
  tone?: ChatRowTone;
  /** true のとき吹き出しの枠を付けない（中身が返事のボタンのとき） */
  bare?: boolean;
  children: ReactNode;
}

export function ChatRow({ side, name, avatar, tone = 'plain', bare = false, children }: ChatRowProps) {
  const isMe = side === 'me';
  return (
    // 外側は overflow hidden（せり上がりの途中を隠す）。アイコンの枠（box-shadow 2px）が切れないよう 3px 外に広げる
    <div className="overflow-hidden" style={{ margin: -3, padding: 3 }}>
      <div className={`flex items-start gap-2 animate-slide-up ${isMe ? 'justify-end' : ''}`}>
        {!isMe && avatar}
        <div className={`flex flex-col min-w-0 max-w-[82%] ${isMe ? 'items-end' : 'items-start'}`}>
          <p className={`text-[10px] font-black text-rw-ink-soft mb-0.5 ${isMe ? 'mr-1' : 'ml-1'}`}>{name}</p>
          {bare ? children : <div className={isMe ? ME_BUBBLE : teacherBubble(tone)}>{children}</div>}
        </div>
        {isMe && avatar}
      </div>
    </div>
  );
}

export default ChatRow;
