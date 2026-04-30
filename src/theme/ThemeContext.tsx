import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  REIWA_PRESETS,
  DEFAULT_THEME_ID,
  ReiwaPalette,
  ReiwaPalettePreset,
  applyPaletteToRoot,
  buildCustomPalette,
  getPresetById,
} from './reiwa';

type CustomOverrides = Partial<Pick<ReiwaPalette, 'primary' | 'accent' | 'pop' | 'tertiary'>>;

type ThemeState = {
  // プリセット ID。'__custom' のときはカスタム色を採用
  themeId: string;
  // ユーザーがカスタムで指定した 4 色。__custom のときに適用される
  custom: CustomOverrides;
  // カスタムのベースとなるプリセット ID (背景・墨色などを引き継ぐ)
  customBaseId: string;
};

type ThemeContextValue = ThemeState & {
  presets: ReiwaPalettePreset[];
  resolved: ReiwaPalette;
  setThemeId: (id: string) => void;
  setCustomColor: (key: keyof CustomOverrides, value: string) => void;
  setCustomBaseId: (id: string) => void;
  resetCustom: () => void;
};

const STORAGE_KEY = 'kobun.reiwaTheme';

function loadInitialState(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { themeId: DEFAULT_THEME_ID, custom: {}, customBaseId: DEFAULT_THEME_ID };
    const parsed = JSON.parse(raw);
    return {
      themeId: typeof parsed?.themeId === 'string' ? parsed.themeId : DEFAULT_THEME_ID,
      custom:
        parsed?.custom && typeof parsed.custom === 'object' && !Array.isArray(parsed.custom)
          ? parsed.custom
          : {},
      customBaseId:
        typeof parsed?.customBaseId === 'string' ? parsed.customBaseId : DEFAULT_THEME_ID,
    };
  } catch {
    return { themeId: DEFAULT_THEME_ID, custom: {}, customBaseId: DEFAULT_THEME_ID };
  }
}

function resolvePalette(state: ThemeState): ReiwaPalette {
  if (state.themeId === '__custom') {
    const base = getPresetById(state.customBaseId) ?? REIWA_PRESETS[0];
    return buildCustomPalette(base, state.custom);
  }
  return getPresetById(state.themeId) ?? REIWA_PRESETS[0];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ReiwaThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(() => loadInitialState());

  const resolved = useMemo(() => resolvePalette(state), [state]);

  // resolved が変わるたびに :root へ書き込む
  useEffect(() => {
    applyPaletteToRoot(resolved);
  }, [resolved]);

  // state が変わるたびに localStorage に保存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota / private mode の場合は黙って失敗
    }
  }, [state]);

  const setThemeId = useCallback((id: string) => {
    setState((s) => ({ ...s, themeId: id }));
  }, []);

  const setCustomColor = useCallback((key: keyof CustomOverrides, value: string) => {
    setState((s) => ({ ...s, custom: { ...s.custom, [key]: value }, themeId: '__custom' }));
  }, []);

  const setCustomBaseId = useCallback((id: string) => {
    setState((s) => ({ ...s, customBaseId: id }));
  }, []);

  const resetCustom = useCallback(() => {
    setState((s) => ({ ...s, custom: {}, themeId: DEFAULT_THEME_ID }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...state,
      presets: REIWA_PRESETS,
      resolved,
      setThemeId,
      setCustomColor,
      setCustomBaseId,
      resetCustom,
    }),
    [state, resolved, setThemeId, setCustomColor, setCustomBaseId, resetCustom],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useReiwaTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useReiwaTheme must be used within <ReiwaThemeProvider>');
  }
  return ctx;
}
