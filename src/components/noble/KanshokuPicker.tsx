import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Stage } from '../../lib/nobleData';
import { defaultPost, kaisetsuFor, postOptions, readChosenPost, useDisplayPost, writeChosenPost, type PostOption } from '../../lib/kanshoku';

// 官職を選ぶシート（2026-11-17 ユーザー指示「位階で中国守・大国とかを選べるように」「官位も選べるように。蔵人など有名どころを」）。
// 今の段で名乗れる官職だけを出す。受領は「大国守」などの等級を開くと国が並ぶ。選んだものは端末ごと（kanshoku.ts）。

const chip = (active: boolean) => ({
  borderColor: active ? 'var(--rw-primary)' : 'var(--rw-rule)',
  background: active ? 'var(--rw-primary-soft)' : 'var(--rw-paper)',
  color: active ? 'var(--rw-primary)' : 'var(--rw-ink)',
});

function zuryoLabel(o: Extract<PostOption, { kind: 'zuryo' }>): string {
  return `${o.grade}${o.post}`;
}

export function KanshokuPicker({ stage, open, onClose }: { stage: Stage; open: boolean; onClose: () => void }) {
  const [chosen, setChosen] = useState<string | null>(() => readChosenPost(stage.n));
  const [openGrade, setOpenGrade] = useState<string | null>(null);
  // 解説を出している名前（タップした官職・国・等級）。開いたときは今名乗っている官職
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChosen(readChosenPost(stage.n));
    setOpenGrade(null);
    setFocus(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stage.n, onClose]);

  if (!open) return null;
  const options = postOptions(stage.n);
  const pick = (name: string | null) => {
    writeChosenPost(stage.n, name);
    setChosen(name);
    setFocus(name);
  };
  const current = chosen ?? defaultPost(stage);
  const view = kaisetsuFor(focus ?? current);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="官職を選ぶ">
      <button type="button" aria-label="閉じる" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[85dvh] overflow-y-auto bg-rw-paper rounded-t-2xl sm:rounded-2xl border-2 border-rw-ink p-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <p className="text-[10px] font-black tracking-widest text-rw-ink-soft">第{stage.n}階 ・ {stage.rank}</p>
            <h2 className="text-base font-black text-rw-ink">名乗る官職を選ぶ</h2>
            <p className="text-[11px] text-rw-ink-soft mt-0.5">この位の人が就いた官職です。いま：<b className="text-rw-ink">{current}</b></p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 w-8 h-8 rounded-full border-2 border-rw-ink font-black" aria-label="閉じる">✕</button>
        </div>

        {/* 解説（タップした官職・国の、読みと簡単な説明。出典 = F:\A2A\_work\kanshoku\kaisetsu.json） */}
        {view && (
          <div className="mt-3 rounded-xl border border-rw-rule bg-rw-bg px-3 py-2" aria-live="polite">
            <p className="text-[13px] font-black text-rw-ink">
              {view.title}
              <span className="ml-1.5 text-[10.5px] font-bold text-rw-ink-soft">（{view.kana}）</span>
            </p>
            {view.lines.map((t, i) => (
              <p key={i} className="mt-0.5 text-[11.5px] leading-relaxed text-rw-ink-soft">{t}</p>
            ))}
          </div>
        )}

        {options.length === 0 && <p className="mt-4 text-sm text-rw-ink-soft">この段で選べる官職はまだありません。</p>}

        <div className="mt-3 space-y-3">
          {options.some((o) => o.kind === 'post') && (
            <div>
              <p className="text-[11px] font-black text-rw-ink-soft mb-1">官職</p>
              <div className="flex flex-wrap gap-1.5">
                {options.map((o) =>
                  o.kind === 'post' ? (
                    <button
                      key={o.name}
                      type="button"
                      onClick={() => pick(o.name)}
                      aria-pressed={current === o.name}
                      title={o.note}
                      className="px-3 py-1.5 rounded-full border-2 text-[13px] font-bold"
                      style={chip(current === o.name)}
                    >
                      {o.name}
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {options.map((o) =>
            o.kind === 'zuryo' ? (
              <div key={zuryoLabel(o)}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenGrade((g) => (g === zuryoLabel(o) ? null : zuryoLabel(o)));
                    setFocus(zuryoLabel(o));
                  }}
                  aria-expanded={openGrade === zuryoLabel(o)}
                  className="w-full text-left px-3 py-2 rounded-xl border-2 border-rw-rule flex items-center gap-2"
                >
                  <span className="flex-1">
                    <span className="block text-[13px] font-black text-rw-ink">受領：{zuryoLabel(o)}</span>
                    <span className="block text-[10.5px] text-rw-ink-soft">
                      {o.grade}（延喜式の国の等級）の{o.post === '守' ? '長官' : '次官'}。国を選ぶ（{o.provinces.length}か国）
                    </span>
                  </span>
                  <span aria-hidden className="text-rw-ink-soft">{openGrade === zuryoLabel(o) ? '▲' : '▼'}</span>
                </button>
                {openGrade === zuryoLabel(o) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {o.provinces.map((p) => {
                      const name = `${p}${o.post}`;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => pick(name)}
                          aria-pressed={current === name}
                          className="px-2.5 py-1 rounded-full border-2 text-[12.5px] font-bold"
                          style={chip(current === name)}
                        >
                          {name}
                        </button>
                      );
                    })}
                    {o.post === '介' && o.grade === '大国' && (
                      <p className="w-full text-[10.5px] text-rw-ink-soft mt-0.5">上総・常陸・上野は親王任国（守は親王）。実際に国へ下るのは介でした。</p>
                    )}
                  </div>
                )}
              </div>
            ) : null,
          )}
        </div>

        {chosen && (
          <button type="button" onClick={() => pick(null)} className="mt-4 text-[12px] font-bold text-rw-ink-soft underline underline-offset-2">
            はじめの表示（{defaultPost(stage)}）に戻す
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default KanshokuPicker;

/** 画面に出す官職名（選んだ官職。選んでいなければ今までの表示）。選び直すとすぐ変わる */
export function PostName({ stage }: { stage: Pick<Stage, 'n' | 'post'> }) {
  return <>{useDisplayPost(stage)}</>;
}
