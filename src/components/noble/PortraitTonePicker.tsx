import { usePortraitTone, PORTRAIT_TONES, PORTRAIT_TONE_LABEL } from '@/lib/portraitTone';
import { MIYABI_PORTRAITS_READY } from '@/lib/nobleData';

// 絵の雰囲気（テーマ画面の「あなたのキャラ」）を選ぶピル。自分の肖像と答え合わせの先生の絵の両方に効く。
// 2026-11-02 に学習履歴（NobleStatsDashboard）からテーマ画面（ReiwaThemePicker）へ移した（ユーザー指示「全部テーマに集める」）。
// 2026-11-13 に「みやび」を足し、名前を ゆるり／いろどり／しっとり／みやび に改めた（ユーザー指示）。名前と順は lib/portraitTone.ts。

export function PortraitTonePicker({ className = '' }: { className?: string }) {
  const [portraitTone, setPortraitTone] = usePortraitTone();
  return (
    <div className={className}>
      <div className="flex gap-2 flex-wrap" role="group" aria-label="絵の雰囲気">
        {PORTRAIT_TONES.map((value) => (
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
            {PORTRAIT_TONE_LABEL[value]}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-rw-ink-soft leading-snug">
        あなたの肖像と、答え合わせの先生の絵が変わります。
        {portraitTone === 'miyabi' && !MIYABI_PORTRAITS_READY && '（みやびの肖像は準備中。いまは しっとり の絵で出ます）'}
      </p>
    </div>
  );
}

export default PortraitTonePicker;
