import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RangeField } from './RangeField';
import { blocksFor, initialWidth, RANGE_WIDTHS, type Range } from '../lib/quiz/rangeBlocks';

// 単語の範囲選び（2026-11-13 ユーザー指示「範囲選択がやや手数が多い」→ 案「幅＋区切りをタップ」）。
// 設定欄には「範囲 1〜50 ▾」のボタン1つだけを置き、押すとシートが開く。
// シート：幅（10・20・50語・全部）を選ぶと、1〜max がその幅で区切られて並ぶ。区切りを1つタップすれば決まって閉じる。
// 細かい指定は「数字で細かく指定」を開くと、今までの RangeField（始・終の数字と矢印）が出る。
// 値の形は RangeField と同じ（{ from, to }）。呼ぶ側の onChange も今までのまま使える。

type Props = {
  value: { from?: number; to?: number };
  onChange: (value: { from?: number; to?: number }) => void;
  min?: number;
  max?: number;
  className?: string;
};

export function RangeBlockPicker({ value, onChange, min = 1, max = 330, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState<number | 'all'>(() => initialWidth(value, max));
  const [fine, setFine] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWidth(initialWidth(value, max));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // 開いたときの値で幅を決める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = value.from && value.to ? `${value.from}〜${value.to}` : value.from ? `${value.from}〜` : value.to ? `〜${value.to}` : `${min}〜${max}`;
  const pick = (r: Range) => {
    onChange(r);
    setOpen(false);
  };
  const isCurrent = (r: Range) => value.from === r.from && value.to === r.to;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg border-2 border-rw-rule bg-rw-bg text-rw-ink text-[13px] font-bold hover:border-rw-primary"
        aria-haspopup="dialog"
      >
        <span className="text-[10px] font-bold text-rw-ink-soft">範囲</span>
        <span className="font-mono">{label}</span>
        <span className="text-rw-ink-soft text-[10px]">▾</span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="範囲を選ぶ">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md bg-rw-paper rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-rw-paper flex items-center justify-between px-4 pt-3 pb-2 border-b border-rw-rule">
              <span className="text-[13px] font-black text-rw-ink">範囲を選ぶ（いま {label}）</span>
              <button type="button" onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-rw-rule/40 text-rw-ink-soft" aria-label="閉じる">✕</button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <div className="text-[11px] font-bold text-rw-ink-soft mb-1">幅</div>
                <div className="flex gap-2 flex-wrap" role="group" aria-label="範囲の幅">
                  {[...RANGE_WIDTHS, 'all' as const].map((w) => {
                    const active = w === width;
                    return (
                      <button
                        key={String(w)}
                        type="button"
                        onClick={() => (w === 'all' ? pick({ from: min, to: max }) : setWidth(w))}
                        aria-pressed={active}
                        className="px-3 py-1 rounded-full border-2 text-[12px] font-bold"
                        style={{
                          borderColor: active ? 'var(--rw-primary)' : 'var(--rw-rule)',
                          background: active ? 'var(--rw-primary-soft)' : 'transparent',
                          color: active ? 'var(--rw-primary)' : 'var(--rw-ink-soft)',
                        }}
                      >
                        {w === 'all' ? `全部（${min}〜${max}）` : `${w}語`}
                      </button>
                    );
                  })}
                </div>
              </div>
              {width !== 'all' && (
                <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="区切り">
                  {blocksFor(width, min, max).map((r) => {
                    const cur = isCurrent(r);
                    return (
                      <button
                        key={r.from}
                        type="button"
                        onClick={() => pick(r)}
                        aria-pressed={cur}
                        className="py-2 rounded-lg border-2 text-[12px] font-bold font-mono"
                        style={{
                          borderColor: cur ? 'var(--rw-primary)' : 'var(--rw-rule)',
                          background: cur ? 'var(--rw-primary)' : 'var(--rw-bg)',
                          color: cur ? '#fff' : 'var(--rw-ink)',
                        }}
                      >
                        {r.from}-{r.to}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="pt-1 border-t border-rw-rule">
                <button type="button" onClick={() => setFine((v) => !v)} className="text-[12px] font-bold text-rw-ink-soft py-1" aria-expanded={fine}>
                  {fine ? '▾' : '▸'} 数字で細かく指定
                </button>
                {fine && (
                  <div className="mt-1">
                    <RangeField value={value} onChange={onChange} min={min} max={max} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default RangeBlockPicker;
