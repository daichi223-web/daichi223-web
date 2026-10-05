import React from 'react';
import type { Word } from '../types';
import { MarkedSentence } from './quiz/MarkedSentence';

interface ExampleDisplayProps {
  exampleKobun?: string;
  exampleModern?: string;
  phase: 'question' | 'answer';
  showKobun?: boolean;
  showModern?: boolean;
  forceShowModern?: boolean; // phaseに関わらず現代語訳を表示
  className?: string;
  target?: Word; // 渡すと、古文の中の問われている語に印を付ける
}

const ExampleDisplay: React.FC<ExampleDisplayProps> = ({
  exampleKobun = '',
  exampleModern = '',
  phase,
  showKobun = true,
  showModern = true,
  forceShowModern = false,
  className = '',
  target
}) => {
  if (!exampleKobun && !exampleModern) {
    return null;
  }

  // forceShowModern=true なら常に表示、そうでなければ phase === 'answer' の時のみ表示
  const shouldShowModern = showModern && exampleModern && (forceShowModern || phase === 'answer');

  return (
    <div className={`border-t p-2 ${className}`}>
      {/* Classical Japanese text with emphasized lemma */}
      {showKobun && exampleKobun && (
        <div className="mb-1">
          <div className="text-sm text-slate-800 leading-normal">
            {target ? <MarkedSentence text={exampleKobun} word={target} /> : exampleKobun}
          </div>
        </div>
      )}

      {/* Modern Japanese translation */}
      {shouldShowModern && (
        <div>
          <div className="text-sm text-slate-700 leading-normal">
            {exampleModern}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExampleDisplay;