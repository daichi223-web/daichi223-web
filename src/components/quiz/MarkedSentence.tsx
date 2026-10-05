import React from 'react';
import type { Word } from '../../types';
import { resolveTargetSpans, splitBySpans } from '../../lib/targetMark';

export interface MarkedSentenceProps {
  /** 古文の例文 */
  text: string;
  /** 問われている語（例文の持ち主） */
  word: Word;
  className?: string;
}

/**
 * 例文を、問われている語に印を付けて描く。
 * 印は活用した形のまま・正しい位置に付ける（位置の決め方は lib/targetMark）。
 * 背景色だけを薄くして文字は薄くしない。長い範囲も折り返せるよう inline のまま。
 */
export function MarkedSentence({ text, word, className }: MarkedSentenceProps) {
  const parts = React.useMemo(
    () => splitBySpans(text, resolveTargetSpans(text, word).spans),
    [text, word]
  );

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.marked ? (
          <mark
            key={i}
            className="font-black underline decoration-2 underline-offset-4 rounded-sm px-0.5 box-decoration-clone"
            style={{
              background: 'color-mix(in srgb, var(--rw-pop) 40%, transparent)',
              color: 'inherit',
              textDecorationColor: 'var(--rw-pop)',
            }}
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        )
      )}
    </span>
  );
}
