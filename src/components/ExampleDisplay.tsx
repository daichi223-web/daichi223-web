import React from 'react';
import type { Word } from '../types';
import { MarkedSentence } from './quiz/MarkedSentence';
import type { Span } from '../lib/targetMark';
import { maskTranslation } from './quiz/writingVerdict';

interface ExampleDisplayProps {
  exampleKobun?: string;
  exampleModern?: string;
  phase: 'question' | 'answer';
  showKobun?: boolean;
  showModern?: boolean;
  forceShowModern?: boolean; // phaseに関わらず現代語訳を表示
  maskAnswer?: boolean; // 回答前（phase=question）の訳は 〔 〕 の中身を伏せる。〔 〕 の無い訳は出さない
  card?: boolean; // 問いの対象の文として、紙のカードに入れて大きく見せる
  className?: string;
  target?: Word; // 渡すと、古文の中の問われている語に印を付ける
  targetSpans?: readonly Span[]; // exampleKobun に付いてきた位置（実戦例文の mark）。あれば最優先
}

// 訳の文字色。rw-ink-soft だけだと地の色（rw-bg・primary-soft）の上で比 4.5 を切るので、ink を半分混ぜる
const MODERN_COLOR = 'color-mix(in srgb, var(--rw-ink) 50%, var(--rw-ink-soft))';

const ExampleDisplay: React.FC<ExampleDisplayProps> = ({
  exampleKobun = '',
  exampleModern = '',
  phase,
  showKobun = true,
  showModern = true,
  forceShowModern = false,
  maskAnswer = false,
  card = false,
  className = '',
  target,
  targetSpans
}) => {
  // forceShowModern=true なら常に表示、そうでなければ phase === 'answer' の時のみ表示
  const shouldShowModern = showModern && exampleModern && (forceShowModern || phase === 'answer');
  // 回答前は答え（〔 〕 の中身）を伏せる。伏せられない訳は null になり、出さない
  const modernText = maskAnswer && phase === 'question' ? maskTranslation(exampleModern) : exampleModern;
  const kobunVisible = showKobun && !!exampleKobun;
  const modernVisible = !!shouldShowModern && !!modernText;

  if (!kobunVisible && !modernVisible) {
    return null;
  }

  const frameClass = card ? 'bg-rw-paper border-2 border-rw-ink rounded-2xl p-5' : 'border-t p-2';
  const kobunClass = card
    ? 'font-serif text-lg text-rw-ink leading-loose font-medium'
    : 'font-serif text-base text-rw-ink leading-relaxed';

  return (
    <div className={`${frameClass} ${className}`}>
      {/* Classical Japanese text with emphasized lemma */}
      {kobunVisible && (
        <div className={modernVisible ? (card ? 'mb-3' : 'mb-1') : ''}>
          <div className={kobunClass}>
            {target ? <MarkedSentence text={exampleKobun} word={target} spans={targetSpans} /> : exampleKobun}
          </div>
        </div>
      )}

      {/* Modern Japanese translation */}
      {modernVisible && (
        <div className={card && kobunVisible ? 'pt-3 border-t border-rw-rule' : ''}>
          <div className="font-serif text-sm leading-relaxed" style={{ color: MODERN_COLOR }}>
            {modernText}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExampleDisplay;
