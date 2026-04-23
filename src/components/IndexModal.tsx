import React from 'react';
import { chapterFor, chapterColor } from '../utils/chapters';
import type { Word } from '../types';

interface IndexModalProps {
  words: Word[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onClose: () => void;
  onWordClick: (word: Word) => void;
  listRef: React.RefObject<HTMLDivElement>;
}

/**
 * 単語索引モーダル。
 * App.tsx から切り出したプレゼンテーション層。状態は親が管理する。
 */
export function IndexModal({
  words,
  searchQuery,
  onSearchChange,
  onClose,
  onWordClick,
  listRef,
}: IndexModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">単語索引</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-200">
          <input
            type="text"
            placeholder="単語・意味・番号で検索..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {words.map((word) => {
              const ch = chapterFor(word.group);
              const c = chapterColor(ch);
              return (
                <div
                  key={`${word.group}-${word.lemma}-${word.sense}`}
                  data-group={word.group}
                  className="flex items-start space-x-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                  onClick={() => onWordClick(word)}
                >
                  <span className="font-mono text-sm text-blue-600 font-bold min-w-[3rem]">
                    {word.group}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-slate-800">{word.lemma}</div>
                      {ch && (
                        <span
                          className="text-[0.68rem] px-1.5 py-0.5 rounded-full"
                          style={{ background: c.bg, color: c.text, fontWeight: 500 }}
                        >
                          {ch.short}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600">{word.sense}</div>
                  </div>
                </div>
              );
            })}
            {words.length === 0 && (
              <div className="text-center text-slate-400 py-8">検索結果がありません</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 text-center text-sm text-slate-500">
          全330見出し語
          {searchQuery && ` （${words.length}件表示）`}
        </div>
      </div>
    </div>
  );
}
