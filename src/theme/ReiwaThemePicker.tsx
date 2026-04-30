import { useState } from 'react';
import { useReiwaTheme } from './ThemeContext';
import { REIWA_PRESETS, ReiwaPalettePreset } from './reiwa';

// ボトムシート / モーダル形式のテーマピッカー。
// 5 色プリセット + カスタム 4 色 (primary / accent / pop / tertiary) を編集できる。

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ReiwaThemePicker({ open, onClose }: Props) {
  const {
    themeId,
    custom,
    customBaseId,
    presets,
    setThemeId,
    setCustomColor,
    setCustomBaseId,
    resetCustom,
  } = useReiwaTheme();

  const [tab, setTab] = useState<'presets' | 'custom'>(themeId === '__custom' ? 'custom' : 'presets');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="テーマ設定"
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-rw-paper rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダ */}
        <div className="sticky top-0 bg-rw-paper px-5 pt-4 pb-3 border-b border-rw-rule z-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-rw-ink tracking-tight">テーマ</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-rw-rule/40 flex items-center justify-center text-rw-ink-soft hover:bg-rw-rule/70"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <TabButton active={tab === 'presets'} onClick={() => setTab('presets')}>
              5色プリセット
            </TabButton>
            <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
              カスタム
            </TabButton>
          </div>
        </div>

        {tab === 'presets' && (
          <div className="px-5 py-5">
            <p className="text-xs text-rw-ink-soft mb-3">タップでテーマを切替</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {presets.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  active={themeId === p.id}
                  onSelect={() => setThemeId(p.id)}
                />
              ))}
            </div>
          </div>
        )}

        {tab === 'custom' && (
          <div className="px-5 py-5 space-y-4">
            <div>
              <p className="text-xs text-rw-ink-soft mb-2">ベース (背景・墨色を引き継ぎ)</p>
              <div className="flex gap-2 flex-wrap">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setCustomBaseId(p.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border-2 ${
                      customBaseId === p.id
                        ? 'border-rw-ink bg-rw-ink text-rw-paper'
                        : 'border-rw-rule bg-rw-paper text-rw-ink-soft'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-rw-ink-soft mb-2">配色 (タップで変更)</p>
              <div className="space-y-2.5">
                <ColorRow
                  label="メインカラー"
                  description="ボタンや見出しに使う中心色"
                  value={custom.primary ?? presets.find((p) => p.id === customBaseId)?.primary ?? presets[0].primary}
                  onChange={(v) => setCustomColor('primary', v)}
                />
                <ColorRow
                  label="アクセント"
                  description="補助タイル・タグ"
                  value={custom.accent ?? presets.find((p) => p.id === customBaseId)?.accent ?? presets[0].accent}
                  onChange={(v) => setCustomColor('accent', v)}
                />
                <ColorRow
                  label="ポップ"
                  description="ハイライト・装飾円"
                  value={custom.pop ?? presets.find((p) => p.id === customBaseId)?.pop ?? presets[0].pop}
                  onChange={(v) => setCustomColor('pop', v)}
                />
                <ColorRow
                  label="サブ"
                  description="3 番目のカラー"
                  value={custom.tertiary ?? presets.find((p) => p.id === customBaseId)?.tertiary ?? presets[0].tertiary}
                  onChange={(v) => setCustomColor('tertiary', v)}
                />
              </div>
            </div>

            <button
              onClick={resetCustom}
              className="w-full py-2.5 text-sm text-rw-ink-soft border border-rw-rule rounded-lg hover:bg-rw-rule/30"
            >
              さくらに戻す
            </button>
          </div>
        )}

        {/* プレビュー帯 */}
        <PreviewStrip />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-sm font-bold rounded-full transition-colors ${
        active ? 'bg-rw-ink text-rw-paper' : 'bg-rw-rule/30 text-rw-ink-soft'
      }`}
    >
      {children}
    </button>
  );
}

function PresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: ReiwaPalettePreset;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative rounded-2xl overflow-hidden border-2 transition-all ${
        active ? 'border-rw-ink shadow-lg -translate-y-0.5' : 'border-rw-rule hover:border-rw-ink-soft'
      }`}
      aria-pressed={active}
      style={{ background: preset.bg }}
    >
      <div className="flex h-14">
        <div className="flex-1" style={{ background: preset.primary }} />
        <div className="flex-1" style={{ background: preset.accent }} />
        <div className="flex-1" style={{ background: preset.pop }} />
      </div>
      <div className="px-2 py-1.5 text-center" style={{ background: preset.paper, color: preset.ink }}>
        <div className="text-sm font-bold">{preset.name}</div>
        <div className="text-[10px] opacity-60">{preset.sub}</div>
      </div>
      {active && (
        <div
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black"
          style={{ background: preset.ink, color: preset.paper }}
        >
          ✓
        </div>
      )}
    </button>
  );
}

function ColorRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-2.5 bg-rw-bg rounded-xl border border-rw-rule cursor-pointer">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 h-12 rounded-lg cursor-pointer border-2 border-rw-rule"
        style={{ background: value }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-rw-ink">{label}</div>
        <div className="text-[11px] text-rw-ink-soft">{description}</div>
      </div>
      <div className="font-mono text-[10px] text-rw-ink-soft uppercase">{value}</div>
    </label>
  );
}

function PreviewStrip() {
  return (
    <div className="border-t border-rw-rule px-5 py-4 bg-rw-bg">
      <p className="text-[10px] text-rw-ink-soft mb-2 tracking-wider uppercase">Preview</p>
      <div className="rounded-2xl bg-rw-primary p-4 relative overflow-hidden">
        <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-rw-pop opacity-50" />
        <div className="absolute -bottom-2 right-6 w-10 h-10 rounded-full bg-rw-accent opacity-50" />
        <div className="relative">
          <div className="text-[10px] text-rw-paper opacity-90 font-bold">Today's Quest</div>
          <div className="text-base text-rw-paper font-black mt-0.5">助動詞「で」を<br />マスターしよう</div>
          <div className="mt-3 inline-block bg-rw-paper text-rw-primary text-xs font-black px-4 py-1.5 rounded-full">
            つづきから ▶
          </div>
        </div>
      </div>
    </div>
  );
}
