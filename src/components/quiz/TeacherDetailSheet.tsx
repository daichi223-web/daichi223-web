import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TEACHERS, teacherImage, type TeacherId } from '../../lib/teachers';
import { TEACHER_PROFILES } from '../../lib/teacherProfiles';
import type { PortraitTone } from '../../lib/portraitTone';

// 先生の人物解説（先生の選択欄で先生をタップすると開く）。
// 上から 大きめの絵 → 史実 → 伝わる話（説話・伝説。史実と区別）→ 先生キャラ（このアプリの創作）→ 出典。
// 史実と創作を混ぜないため、節を分けて見出しと地の色で区別する。中身は lib/teacherProfiles.ts。
// テーマ設定のシート（transform のかかった要素）の中から開くので、body へ portal して全画面に重ねる。

type Props = {
  id: TeacherId | null;
  tone: PortraitTone;
  selected: boolean;
  onSelect: (id: TeacherId) => void;
  onClose: () => void;
};

function Section({ title, note, tint, children }: { title: string; note?: string; tint?: 'fact' | 'legend' | 'fiction'; children: React.ReactNode }) {
  const bg = tint === 'fiction' ? 'var(--rw-primary-soft)' : tint === 'legend' ? 'var(--rw-bg)' : 'transparent';
  return (
    <section className="mt-3 rounded-2xl border border-rw-rule px-3.5 py-3" style={{ background: bg }}>
      <h3 className="text-[13px] font-black text-rw-ink tracking-tight">{title}</h3>
      {note && <p className="text-[10.5px] text-rw-ink-soft leading-snug mt-0.5">{note}</p>}
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

const Bullets = ({ items }: { items: readonly string[] }) => (
  <ul className="space-y-1">
    {items.map((t, i) => (
      <li key={i} className="flex gap-1.5 text-[13px] leading-relaxed text-rw-ink">
        <span className="text-rw-ink-soft shrink-0">・</span>
        <span>{t}</span>
      </li>
    ))}
  </ul>
);

export function TeacherDetailSheet({ id, tone, selected, onSelect, onClose }: Props) {
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id, onClose]);

  if (!id) return null;
  const t = TEACHERS[id];
  const p = TEACHER_PROFILES[id];

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${t.name}の人物解説`}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md bg-rw-paper rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="teacher-detail"
      >
        <div className="sticky top-0 z-10 bg-rw-paper flex items-center justify-between px-4 pt-3 pb-2 border-b border-rw-rule">
          <span className="text-[11px] font-bold text-rw-ink-soft">先生の人物解説</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-rw-rule/40 flex items-center justify-center text-rw-ink-soft"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pb-5">
          <div className="flex flex-col items-center pt-3">
            <img
              src={teacherImage(id, tone)}
              alt={`${t.name}の絵`}
              width={176}
              height={176}
              draggable={false}
              className="rounded-2xl border-2 border-rw-ink object-cover"
              style={{ width: 176, height: 176 }}
            />
            <div className="mt-2 text-[11px] text-rw-ink-soft leading-none">{t.kana}</div>
            <h2 className="mt-1 text-xl font-black text-rw-ink tracking-tight">{t.name}</h2>
            <div className="mt-1 text-[12px] font-bold text-rw-ink-soft text-center">{p.era}</div>
            <div className="mt-0.5 text-[12px] text-rw-ink-soft text-center">{t.title}</div>
            <p className="mt-1 text-[10px] text-rw-ink-soft">絵は想像図（AI 生成）です。</p>
          </div>

          {/* 選ぶボタンは名前のすぐ下（2026-11-13 ユーザー指示「この先生にするのボタンは上部に」）。閉じるは上の ✕ */}
          <button
            type="button"
            onClick={() => { onSelect(id); onClose(); }}
            disabled={selected}
            className="mt-3 w-full py-2.5 rounded-xl border-2 border-rw-ink text-[14px] font-black disabled:opacity-60"
            style={{ background: selected ? 'transparent' : 'var(--rw-primary)', color: selected ? 'var(--rw-ink-soft)' : '#fff' }}
          >
            {selected ? 'いま選んでいる先生' : 'この先生にする'}
          </button>

          <Section title="史実" note="史料や作品から確かめられること">
            <Bullets items={p.facts} />
            {p.words.length > 0 && (
              <div className="mt-2 pt-2 border-t border-rw-rule space-y-1.5">
                {p.words.map((w, i) => (
                  <div key={i} className="text-[12.5px] leading-relaxed">
                    <div className="text-rw-ink font-serif">「{w.text}」</div>
                    <div className="text-[10.5px] text-rw-ink-soft">{w.source}{w.gloss ? `／${w.gloss}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {p.legends.length > 0 && (
            <Section title="伝わる話" note="後の時代の説話・伝説。史実とは区別して読む" tint="legend">
              <Bullets items={p.legends} />
            </Section>
          )}

          <Section title="先生キャラ" note="ここからはこのアプリの創作。史実をもとに起こした人物像" tint="fiction">
            <p className="text-[13px] leading-relaxed text-rw-ink">{p.character.summary}</p>
            <ul className="mt-2 space-y-1.5">
              {p.character.basis.map((b, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed">
                  <span className="font-bold text-rw-ink">{b.trait}</span>
                  <span className="text-rw-ink-soft"> ← {b.from}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] leading-relaxed text-rw-ink-soft">創作の部分：{p.character.fiction}</p>
          </Section>

          {p.sources.length > 0 && (
            <p className="mt-3 text-[10.5px] leading-relaxed text-rw-ink-soft">出典：{p.sources.join('／')}</p>
          )}

          <div className="mt-4">
            <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl border-2 border-rw-rule text-[14px] font-bold text-rw-ink-soft">
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default TeacherDetailSheet;
