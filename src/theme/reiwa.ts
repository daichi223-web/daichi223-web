// Reiwa デザイン用カラーパレット定義
// handoff/dir-reiwa.jsx の RW_VARIANTS をベースに TypeScript 化
// CSS variables (--rw-*) として :root に書き込んでテーマ切替を実現する

export type ReiwaPalette = {
  bg: string;
  paper: string;
  ink: string;
  inkSoft: string;
  rule: string;
  primary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  pop: string;
  tertiary: string;
};

export type ReiwaPalettePreset = ReiwaPalette & {
  id: string;
  name: string;
  sub: string;
};

// 5 色プリセット (handoff v3/dir-reiwa.jsx 準拠)
// 3 系統: 明るい / 落ち着き / パステル
export const REIWA_PRESETS: ReiwaPalettePreset[] = [
  // 明るい
  {
    id: 'shuka',
    name: '朱夏',
    sub: 'coral + teal · 明るい',
    bg: '#fff5ef',
    paper: '#ffffff',
    ink: '#1f1612',
    inkSoft: '#7a665a',
    rule: '#ecd9cc',
    primary: '#e8624e',
    primarySoft: '#fcdcd4',
    accent: '#4ab8a0',
    accentSoft: '#d6efe8',
    pop: '#ffc94a',
    tertiary: '#5a8fd6',
  },
  {
    id: 'wakaba',
    name: '若葉',
    sub: 'fresh green · 明るい',
    bg: '#f4f7ec',
    paper: '#ffffff',
    ink: '#1c2416',
    inkSoft: '#6e7a5e',
    rule: '#dde2cc',
    primary: '#6fb04c',
    primarySoft: '#dde9cc',
    accent: '#e88858',
    accentSoft: '#fadfd0',
    pop: '#ecd058',
    tertiary: '#5a9cb8',
  },
  // 落ち着き
  {
    id: 'tsuchi',
    name: '土',
    sub: 'terracotta + sage · 落ち着き',
    bg: '#f6f1ea',
    paper: '#fdfaf5',
    ink: '#2a2520',
    inkSoft: '#7a6f64',
    rule: '#e3dccf',
    primary: '#c47868',
    primarySoft: '#f0e0d8',
    accent: '#8aaa8e',
    accentSoft: '#dfe7da',
    pop: '#d9b574',
    tertiary: '#8896b8',
  },
  {
    id: 'nibi',
    name: '鈍色',
    sub: 'slate + ochre · 落ち着き',
    bg: '#eef0f1',
    paper: '#fafbfc',
    ink: '#23272d',
    inkSoft: '#6c747e',
    rule: '#d8dce0',
    primary: '#6c7e94',
    primarySoft: '#dde2e7',
    accent: '#b8946a',
    accentSoft: '#ece1d2',
    pop: '#d9b264',
    tertiary: '#9c7e9c',
  },
  // パステル
  {
    id: 'hakuou',
    name: '白桜',
    sub: 'pink + mint · パステル',
    bg: '#fcf4f3',
    paper: '#ffffff',
    ink: '#2a1f24',
    inkSoft: '#80707a',
    rule: '#ecdde0',
    primary: '#f0a8b5',
    primarySoft: '#fce4e8',
    accent: '#a8d4b8',
    accentSoft: '#dfeee5',
    pop: '#f5d890',
    tertiary: '#b4bce0',
  },
];

// 落ち着きの「土」をデフォルトに変更 (handoff 準拠: getRwT() の v || 'tsuchi')
export const DEFAULT_THEME_ID = 'tsuchi';

// カスタムモードのクイック切替プリセット (4 色のみ: primary / accent / pop / tertiary)。
// bg/paper/ink などはベースプリセットから引き継いだまま、配色のみ素早く試せる。
// 5 つは REIWA_PRESETS と同名を持つが、bg などを含まない 4 色定義。
export type ReiwaQuickPreset = {
  id: string;
  name: string;
  category: '明るい' | '落ち着き' | 'パステル';
  primary: string;
  accent: string;
  pop: string;
  tertiary: string;
};

export const REIWA_QUICK_PRESETS: ReiwaQuickPreset[] = [
  // 明るい
  { id: 'shuka',   name: '朱夏', category: '明るい',   primary: '#e8624e', accent: '#4ab8a0', pop: '#ffc94a', tertiary: '#5a8fd6' },
  { id: 'mikan',   name: '蜜柑', category: '明るい',   primary: '#f08850', accent: '#5fa8d4', pop: '#f5cc5e', tertiary: '#b87cc8' },
  { id: 'wakaba',  name: '若葉', category: '明るい',   primary: '#6fb04c', accent: '#e88858', pop: '#ecd058', tertiary: '#5a9cb8' },
  // 落ち着き
  { id: 'tsuchi',  name: '土',   category: '落ち着き', primary: '#c47868', accent: '#8aaa8e', pop: '#d9b574', tertiary: '#8896b8' },
  { id: 'nibi',    name: '鈍色', category: '落ち着き', primary: '#6c7e94', accent: '#b8946a', pop: '#d9b264', tertiary: '#9c7e9c' },
  { id: 'sumika',  name: '墨花', category: '落ち着き', primary: '#4a5e74', accent: '#c49860', pop: '#d4b572', tertiary: '#846878' },
  // パステル
  { id: 'hakuou',  name: '白桜', category: 'パステル', primary: '#f0a8b5', accent: '#a8d4b8', pop: '#f5d890', tertiary: '#b4bce0' },
  { id: 'fujikasumi', name: '藤霞', category: 'パステル', primary: '#b8a4dc', accent: '#f4b8a8', pop: '#f0d890', tertiary: '#a8c8d8' },
];

export function getPresetById(id: string): ReiwaPalettePreset | undefined {
  return REIWA_PRESETS.find((p) => p.id === id);
}

// 5 色プリセットから派生してカスタム色を作成するためのヘルパー。
// ユーザーは primary / accent / pop / tertiary の 4 色だけカスタムでき、
// 残り (bg / paper / ink / inkSoft / rule / *Soft) はベースプリセットから引き継ぐ。
export function buildCustomPalette(
  base: ReiwaPalettePreset,
  overrides: Partial<Pick<ReiwaPalette, 'primary' | 'accent' | 'pop' | 'tertiary'>>,
): ReiwaPalette {
  const primary = overrides.primary ?? base.primary;
  const accent = overrides.accent ?? base.accent;
  return {
    bg: base.bg,
    paper: base.paper,
    ink: base.ink,
    inkSoft: base.inkSoft,
    rule: base.rule,
    primary,
    primarySoft: primary + '22', // 13% opacity (handoff と同じ流儀)
    accent,
    accentSoft: accent + '22',
    pop: overrides.pop ?? base.pop,
    tertiary: overrides.tertiary ?? base.tertiary,
  };
}

// :root に CSS variables を書き込む
export function applyPaletteToRoot(palette: ReiwaPalette): void {
  const root = document.documentElement;
  root.style.setProperty('--rw-bg', palette.bg);
  root.style.setProperty('--rw-paper', palette.paper);
  root.style.setProperty('--rw-ink', palette.ink);
  root.style.setProperty('--rw-ink-soft', palette.inkSoft);
  root.style.setProperty('--rw-rule', palette.rule);
  root.style.setProperty('--rw-primary', palette.primary);
  root.style.setProperty('--rw-primary-soft', palette.primarySoft);
  root.style.setProperty('--rw-accent', palette.accent);
  root.style.setProperty('--rw-accent-soft', palette.accentSoft);
  root.style.setProperty('--rw-pop', palette.pop);
  root.style.setProperty('--rw-tertiary', palette.tertiary);
}
