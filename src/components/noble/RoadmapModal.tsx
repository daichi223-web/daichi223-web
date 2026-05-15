import { useEffect, useRef } from 'react';
import { STAGES, robeColorOf } from '@/lib/nobleData';

// 出世絵巻 — 21 階全図。現在の階位にスクロール、過去はくすませて表示。
type Props = {
  currentN: number;
  onClose: () => void;
};

export default function RoadmapModal({ currentN, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector('[data-rm-current="true"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }, []);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-stretch"
      style={{ background: 'rgba(26,20,17,0.7)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full flex flex-col bg-rw-paper"
      >
        <div
          className="px-4 py-3 flex items-center justify-between border-b"
          style={{
            borderColor: 'rgba(106,82,53,0.18)',
            background: 'linear-gradient(180deg, #f6efe0, #ece1c8)',
          }}
        >
          <div>
            <div className="text-[10px] tracking-widest text-rw-ink-soft">出世絵巻</div>
            <div
              className="text-lg font-black tracking-wider text-rw-ink mt-0.5"
              style={{ fontFamily: '"Noto Serif JP", serif' }}
            >
              二十一階 全図
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-bold tracking-wider border border-rw-ink-soft text-rw-ink rounded bg-white/40"
          >
            閉じる
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
          {[...STAGES].reverse().map((s) => {
            const isCurrent = s.n === currentN;
            const isPast = s.n < currentN;
            return (
              <div
                key={s.n}
                data-rm-current={isCurrent ? 'true' : 'false'}
                className="flex gap-3 mb-1 px-3 py-2.5 rounded items-center"
                style={{
                  background: isCurrent ? 'rgba(184,66,58,0.08)' : 'transparent',
                  border: isCurrent
                    ? '1px solid rgba(184,66,58,0.4)'
                    : '1px solid transparent',
                  opacity: isPast ? 0.55 : 1,
                }}
              >
                {/* 階数 */}
                <div className="w-9 shrink-0 text-center">
                  <div
                    className="font-black text-2xl leading-none"
                    style={{
                      fontFamily: '"Noto Serif JP", serif',
                      color: isCurrent
                        ? '#b8423a'
                        : s.apex
                        ? '#b08841'
                        : 'var(--rw-ink-soft)',
                    }}
                  >
                    {s.n}
                  </div>
                  <div className="text-[8px] tracking-widest text-rw-ink-soft/70 mt-0.5">
                    {s.n === 21 ? '極位' : ''}
                  </div>
                </div>

                {/* 情報 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span
                      className="font-black text-base tracking-wide text-rw-ink"
                      style={{ fontFamily: '"Noto Serif JP", serif' }}
                    >
                      {s.rank}
                    </span>
                    <span
                      className="text-[8px] font-black tracking-widest px-1.5 py-0.5 border"
                      style={{
                        color:
                          s.era === '極位'
                            ? '#b58800'
                            : s.era === '公卿'
                            ? 'var(--rw-primary)'
                            : s.era === '殿上人'
                            ? 'var(--rw-accent)'
                            : 'var(--rw-ink-soft)',
                        borderColor:
                          s.era === '極位'
                            ? '#b58800'
                            : s.era === '公卿'
                            ? 'var(--rw-primary)'
                            : s.era === '殿上人'
                            ? 'var(--rw-accent)'
                            : 'var(--rw-ink-soft)',
                      }}
                    >
                      {s.era}
                    </span>
                    {s.milestone && (
                      <span className="text-[9px] tracking-wider" style={{ color: '#b08841' }}>
                        ★節目
                      </span>
                    )}
                    {s.apex && <span className="text-[9px]">👑</span>}
                  </div>
                  <div className="text-[11px] text-rw-ink-soft tracking-wide mt-0.5">{s.post}</div>
                  <div className="mt-1 text-[9px] text-rw-ink-soft leading-tight">
                    <span className="text-rw-ink font-bold">{s.display.head}</span>
                    <span className="mx-1">・</span>
                    <span className="text-rw-ink font-bold">{s.display.robe}</span>
                    <span className="mx-1">・</span>
                    {s.display.train !== 'なし' && (
                      <>
                        <span>裾{s.display.train}</span>
                        <span className="mx-1">・</span>
                      </>
                    )}
                    <span>{s.display.item}</span>
                    {s.display.belt !== 'なし' && (
                      <>
                        <span className="mx-1">・</span>
                        <span>{s.display.belt}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* 袍の色サンプル */}
                <div
                  className="w-2 self-stretch rounded-sm"
                  style={{ background: robeColorOf(s.display.robe) }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
