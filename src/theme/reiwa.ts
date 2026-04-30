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

// 5 色プリセット (handoff/dir-reiwa.jsx と同一)
export const REIWA_PRESETS: ReiwaPalettePreset[] = [
  {
    id: 'sakura',
    name: 'さくら',
    sub: 'pink + mint',
    bg: '#fff8f3',
    paper: '#ffffff',
    ink: '#1f1530',
    inkSoft: '#7a6e8c',
    rule: '#ebe2d8',
    primary: '#ff5e8a',
    primarySoft: '#ffe6ed',
    accent: '#5dd4ad',
    accentSoft: '#dff7ed',
    pop: '#ffd44d',
    tertiary: '#6ba8ff',
  },
  {
    id: 'ramune',
    name: 'ラムネ',
    sub: 'sky + coral',
    bg: '#f3f9ff',
    paper: '#ffffff',
    ink: '#0f2240',
    inkSoft: '#6f7e96',
    rule: '#dde5f0',
    primary: '#4ab8ff',
    primarySoft: '#dff0ff',
    accent: '#ff8a6e',
    accentSoft: '#ffe6df',
    pop: '#ffd84d',
    tertiary: '#8b6eff',
  },
  {
    id: 'matcha',
    name: '抹茶',
    sub: 'matcha + cream',
    bg: '#f6f4ea',
    paper: '#ffffff',
    ink: '#1f2a18',
    inkSoft: '#7a836e',
    rule: '#e0ddc7',
    primary: '#7fb84a',
    primarySoft: '#e8f3d7',
    accent: '#e89a3a',
    accentSoft: '#fbedd6',
    pop: '#f5d76e',
    tertiary: '#5fa8a0',
  },
  {
    id: 'yuzu',
    name: '柚子',
    sub: 'yuzu + violet',
    bg: '#fffbef',
    paper: '#ffffff',
    ink: '#231538',
    inkSoft: '#7a6e8a',
    rule: '#ece4d4',
    primary: '#f5b800',
    primarySoft: '#fff1c2',
    accent: '#9b6bd6',
    accentSoft: '#ece0fa',
    pop: '#ff7a4a',
    tertiary: '#5dd4ad',
  },
  {
    id: 'lavender',
    name: '薄紫',
    sub: 'lavender + peach',
    bg: '#faf6ff',
    paper: '#ffffff',
    ink: '#1c1a2e',
    inkSoft: '#7a738c',
    rule: '#e8e1f0',
    primary: '#a87bff',
    primarySoft: '#ece1ff',
    accent: '#ffa888',
    accentSoft: '#ffe6dd',
    pop: '#ffd84d',
    tertiary: '#5fcfd4',
  },
];

export const DEFAULT_THEME_ID = 'sakura';

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
