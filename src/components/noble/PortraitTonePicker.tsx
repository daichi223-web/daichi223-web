import { usePortraitTone, type PortraitTone } from '@/lib/portraitTone';

// 自分の肖像の画風（肖像の雰囲気）を選ぶ3つのピル。
// 2026-11-02 に学習履歴（NobleStatsDashboard）からテーマ画面（ReiwaThemePicker）へ移した（ユーザー指示「全部テーマに集める」）。
const TONES: Array<[PortraitTone, string]> = [
  ['yuru', 'ゆるキャラ×史実'],
  ['pop', 'ポップ学習キャラ'],
  ['sharp', 'キリッと青年'],
];

export function PortraitTonePicker({ className = '' }: { className?: string }) {
  const [portraitTone, setPortraitTone] = usePortraitTone();
  return (
    <div className={`flex gap-2 flex-wrap ${className}`} role="group" aria-label="肖像の雰囲気">
      {TONES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setPortraitTone(value)}
          aria-pressed={portraitTone === value}
          className="px-2.5 py-1 rounded-full text-[11px] font-bold border-2 transition"
          style={{
            borderColor: portraitTone === value ? 'var(--rw-primary)' : 'var(--rw-rule)',
            background: portraitTone === value ? 'var(--rw-primary-soft)' : 'transparent',
            color: portraitTone === value ? 'var(--rw-primary)' : 'var(--rw-ink-soft)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default PortraitTonePicker;
