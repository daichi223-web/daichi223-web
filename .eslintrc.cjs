module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  ignorePatterns: ['dist/', 'node_modules/', 'tmp/', 'exports/'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    // 既存コンポーネントに意図的な依存配列固定が残っているため、
    // Hook順序違反だけをCIのブロッカーにする。
    'react-hooks/exhaustive-deps': 'off',
    'react-refresh/only-export-components': 'off',
  },
};
