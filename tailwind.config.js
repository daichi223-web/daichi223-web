/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'noto': ['Noto Sans JP', 'sans-serif'],
        'serif': ['"Noto Serif JP"', '"Yu Mincho"', '"Hiragino Mincho Pro"', 'serif'],
      },
      colors: {
        // kobun-v3 palette
        sumi: 'var(--sumi)',
        shu: 'var(--shu)',
        kin: 'var(--kin)',
        sakura: 'var(--sakura)',
        washi: 'var(--washi)',
        scaffold: 'var(--scaffold)',
        'layer-1': 'var(--layer-1)',
        'layer-2': 'var(--layer-2)',
        'layer-3': 'var(--layer-3)',
        'layer-4': 'var(--layer-4)',
        'layer-5': 'var(--layer-5)',
      },
    },
  },
  plugins: [],
}
