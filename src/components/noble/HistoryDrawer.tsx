import { readPromotionHistory, type PromotionRecord } from '@/lib/promotionHistory';
import { useEffect, useState } from 'react';

// 昇進履歴ドロワー — promotionHistory.ts から実データを読み出して表示。
// 過去にどの位階を経由してきたかを時系列で見せる。

type Props = {
  onClose: () => void;
};

export default function HistoryDrawer({ onClose }: Props) {
  const [history, setHistory] = useState<PromotionRecord[]>([]);

  useEffect(() => {
    setHistory(readPromotionHistory());
  }, []);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(26,20,17,0.4)' }}
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-rw-paper rounded-t-2xl px-5 pt-4 pb-7 max-h-[70vh] overflow-y-auto"
        style={{ borderTop: '1px solid var(--rw-ink-soft)' }}
      >
        <div
          className="w-9 h-1 mx-auto mb-3.5 rounded"
          style={{ background: 'var(--rw-ink-soft)' }}
          aria-hidden
        />
        <h3
          className="text-lg font-black tracking-wide text-rw-ink mb-1"
          style={{ fontFamily: '"Noto Serif JP", serif' }}
        >
          昇進の記録
        </h3>
        <div className="text-xs text-rw-ink-soft mb-3.5">
          これまでの叙位 {history.length} 回
        </div>

        {history.length === 0 ? (
          <div className="text-xs text-rw-ink-soft text-center py-7 leading-loose">
            まだ昇進の記録はありません。
            <br />
            学習を始めて、初の叙位を目指しましょう。
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {[...history].reverse().map((h) => (
              <div
                key={h.timestamp}
                className="grid items-center gap-2.5 px-2.5 py-2 rounded-sm"
                style={{
                  gridTemplateColumns: '34px 1fr auto',
                  background: 'rgba(255,255,255,0.4)',
                }}
              >
                <div
                  className="text-center font-black text-base"
                  style={{
                    fontFamily: '"Noto Serif JP", serif',
                    color: h.n === 21 ? '#b08841' : 'var(--rw-ink-soft)',
                  }}
                >
                  {h.n}
                </div>
                <div>
                  <div className="text-xs font-bold text-rw-ink">
                    {h.rank} ・ {h.post}
                  </div>
                  <div className="text-[10px] text-rw-ink-soft tracking-wider mt-0.5">
                    {h.era}
                  </div>
                </div>
                <div className="text-[10px] text-rw-ink-soft tracking-wider text-right">
                  {jpAgo(h.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function jpAgo(ts: number): string {
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  if (days === 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 30) return `${days}日前`;
  if (days < 365) return `${Math.floor(days / 30)}ヶ月前`;
  return `${Math.floor(days / 365)}年前`;
}
