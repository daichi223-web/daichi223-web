import React from 'react';
import type { Word } from '../../types';
import { describeNorm } from '../../lib/writingJudge';
import { senseLabel } from './writingVerdict';

export interface SenseAnswerGuideProps {
  word: Word;
  /** 正解の言い方の行に付けるクラス（置き場所ごとの文字の大きさ・太さ） */
  className?: string;
}

/**
 * 記述の「正解」欄。どこまで書けば正解かが分かるように示す。
 * 言い方が複数ならどれか1つでよい・頭の括弧と「〜」は書かなくてよい・後ろの括弧は注記。
 * 分け方は判定（lib/writingJudge の expandNorm）と同じ。辞書形の無い語は従来どおり1行。
 */
export function SenseAnswerGuide({ word, className = '' }: SenseAnswerGuideProps) {
  const guide = describeNorm(word.senseNorm);
  if (guide.options.length === 0) {
    return <p className={className}>{senseLabel(word)}</p>;
  }

  const hasTilde = guide.options.some((o) => /[〜～~]/.test(o));
  const hints: string[] = [];
  if (guide.options.length > 1) hints.push('どれか1つ書ければ○');
  if (guide.optionalLead) hints.push('（ ）の中は書かなくてよい');
  if (hasTilde) hints.push('〜 は書かなくてよい');

  return (
    <div>
      <p className={className}>
        {guide.optionalLead && (
          <span className="text-rw-ink-soft font-medium">（{guide.optionalLead}）</span>
        )}
        {guide.options.map((option, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="mx-2 text-rw-ink-soft font-medium">／</span>}
            <span>{option}</span>
          </React.Fragment>
        ))}
      </p>
      {guide.notes.map((note, i) => (
        <p key={i} className="text-xs text-rw-ink-soft font-medium mt-1">（{note}）</p>
      ))}
      {hints.length > 0 && (
        <p className="text-xs text-rw-ink-soft font-medium mt-1">{hints.join('　')}</p>
      )}
    </div>
  );
}
