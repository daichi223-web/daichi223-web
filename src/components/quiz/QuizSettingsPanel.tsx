/**
 * クイズ画面の上の部品（2026-11-16 に src/App.tsx から切り出した。見た目と文言はそのまま）。
 *   QuizModeTabs      … 単語モード／多義語モードのタブ
 *   QuizSettingsPanel … 形式・出す語の選び方・問題数・範囲（単語と多義語で同じ形。中身だけ違う）
 * 状態は持たない（問題数の入力欄の全選択だけ自前）。
 */
import { RangeBlockPicker } from '../RangeBlockPicker';
import { useFullSelectInput } from '../../hooks/useFullSelectInput';

type Mode = 'word' | 'polysemy';

export function QuizModeTabs({ current, onSelect }: { current: Mode; onSelect: (mode: Mode) => void }) {
  const tab = (mode: Mode, label: string) => (
    <button
      onClick={() => onSelect(mode)}
      className={`mode-tab ${current === mode ? 'active-tab' : ''}`}
      style={{
        padding: '0.75rem 1.5rem',
        fontWeight: 600,
        color: current === mode ? 'var(--rw-primary)' : 'var(--rw-ink-soft)',
        borderBottom: current === mode ? '3px solid var(--rw-primary)' : '3px solid transparent',
        transition: 'all 0.2s ease-in-out',
        cursor: 'pointer',
        minHeight: '44px',
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="flex justify-center border-b border-rw-rule mb-4 bg-rw-paper rounded-t-2xl shadow-sm">
      {tab('word', '単語モード')}
      {tab('polysemy', '多義語モード')}
    </div>
  );
}

type Range = { from?: number; to?: number };

type PanelProps<T extends string> = {
  /** 形式の選択肢（並び順どおりに出す） */
  typeOptions: Array<{ value: T; label: string }>;
  quizType: T;
  onQuizTypeChange: (t: T) => void;
  pickMode: 'auto' | 'random';
  onPickModeChange: (m: 'auto' | 'random') => void;
  /** 「前回の内訳」の1行（おまかせで選んだときだけ。無ければ出さない） */
  lastPickLine: string | null;
  numQuestions: number;
  onNumQuestionsChange: (n: number) => void;
  /** 問題数を空にしたまま離れたときに戻す数 */
  defaultNumQuestions: number;
  range: Range;
  onRangeChange: (r: Range) => void;
};

export function QuizSettingsPanel<T extends string>({
  typeOptions,
  quizType,
  onQuizTypeChange,
  pickMode,
  onPickModeChange,
  lastPickLine,
  numQuestions,
  onNumQuestionsChange,
  defaultNumQuestions,
  range,
  onRangeChange,
}: PanelProps<T>) {
  const fullSelect = useFullSelectInput();
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 左列: モードと問題数 */}
      <div className="space-y-2">
        <div>
          <select
            value={quizType}
            onChange={(e) => onQuizTypeChange(e.target.value as T)}
            className="w-full p-1 bg-rw-bg border border-rw-rule text-rw-ink rounded text-xs"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={pickMode}
            onChange={(e) => onPickModeChange(e.target.value as 'auto' | 'random')}
            className="w-full p-1 bg-rw-bg border border-rw-rule text-rw-ink rounded text-xs"
            title="どの語を出すか。おまかせは学習記録から、苦手→まだ解いていない語（番号順）→途中の語 の順に配分し、正答率の高い語は頻度を下げる"
          >
            <option value="auto">出す語はおまかせ（苦手・未着手を優先）</option>
            <option value="random">出す語はランダム</option>
          </select>
          {pickMode === 'auto' && lastPickLine && (
            <div className="text-[10px] text-rw-ink-soft mt-0.5">{lastPickLine}</div>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <label className="text-xs text-rw-ink-soft whitespace-nowrap">問題数</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="done"
            value={numQuestions}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') return;
              const n = parseInt(v, 10);
              if (!Number.isNaN(n)) onNumQuestionsChange(Math.max(1, Math.min(330, n)));
            }}
            onBlur={(e) => {
              if (e.target.value === '' || Number.isNaN(parseInt(e.target.value, 10))) {
                onNumQuestionsChange(defaultNumQuestions);
              }
            }}
            {...fullSelect}
            onWheel={(e) => e.preventDefault()}
            min="1"
            max="330"
            placeholder="数"
            className="w-14 p-1 bg-rw-bg border border-rw-rule text-rw-ink rounded text-center text-base"
            style={{
              MozAppearance: 'textfield',
              WebkitAppearance: 'none',
            }}
          />
        </div>
      </div>
      {/* 右列: 範囲選択（ボタン1つ→シートで幅と区切りをタップ。2026-11-13 ユーザー指示。components/RangeBlockPicker.tsx） */}
      <div>
        <RangeBlockPicker value={range} onChange={onRangeChange} min={1} max={330} />
      </div>
    </div>
  );
}
