/**
 * 単語クイズの画面右上に固定するボタンの列（2026-11-16 に src/App.tsx から切り出した。見た目と文言はそのまま）。
 * 状態は持たない。
 */
import { returnLabels } from '@/lib/returnTo';

type Props = {
  /** ホームを表示中か（表示中は「ホーム」「戻る」を出さない） */
  showHome: boolean;
  /** 教材・単語カードから来たときの戻り先 */
  returnTo: string | null;
  /** 検索ボタンに出す語（答えが見出し語の形式では、答える前は空） */
  searchLemma: string;
  /** 教員の管理画面へのボタンを出すか */
  showTeacher: boolean;
  onReturn: (path: string) => void;
  onHome: () => void;
  onOpenTheme: () => void;
  onOpenIndex: () => void;
};

export function QuizToolbar({ showHome, returnTo, searchLemma, showTeacher, onReturn, onHome, onOpenTheme, onOpenIndex }: Props) {
  const searchHref = searchLemma ? `/search?q=${encodeURIComponent(searchLemma)}` : '/search';
  return (
    <div className="fixed top-2 right-2 z-50 flex gap-1.5">
      {!showHome && returnTo && (
        <button
          onClick={() => onReturn(returnTo)}
          className="bg-rw-paper hover:bg-rw-primary-soft text-rw-ink border-2 border-rw-ink whitespace-nowrap font-bold py-1 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
          title={returnLabels(returnTo).title}
        >
          {/* 戻り先が単語カードのときは「単語カードへ」（2026-11-06） */}
          📖<span className="ml-1">{returnLabels(returnTo).short}</span>
        </button>
      )}
      {!showHome && (
        <button
          onClick={onHome}
          className="bg-rw-ink hover:opacity-90 text-rw-paper font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
          title="ホームに戻る"
        >
          🏠<span className="hidden sm:inline ml-1">ホーム</span>
        </button>
      )}
      <button
        onClick={onOpenTheme}
        className="bg-rw-primary hover:opacity-90 text-rw-paper font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
        title="テーマ設定 (5色プリセット + カスタム)"
      >
        🎨<span className="hidden sm:inline ml-1">テーマ</span>
      </button>
      <a
        href={searchHref}
        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
        title={searchLemma ? `「${searchLemma}」を検索` : '単語・例文・教材を検索'}
      >
        🔍<span className="ml-1">{searchLemma ? `「${searchLemma}」` : '検索'}</span>
      </a>
      <a
        href="/read"
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
        title="古文読み（読解モード）"
      >
        📚<span className="hidden sm:inline ml-1">読解</span>
      </a>
      <a
        href="/read/grammar"
        className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
        title="文法道場（ドリル＋識別）"
      >
        ⚔️<span className="hidden sm:inline ml-1">文法</span>
      </a>
      <button
        onClick={onOpenIndex}
        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
      >
        索引
      </button>
      {showTeacher && (
        <a
          href="/teacher"
          className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-1.5 px-2 md:px-3 rounded-lg shadow-lg transition-colors text-xs md:text-sm"
          title="教員管理画面(回答一覧・誤答分析・教材公開管理)"
        >
          🛠<span className="hidden sm:inline ml-1">教員</span>
        </a>
      )}
    </div>
  );
}
