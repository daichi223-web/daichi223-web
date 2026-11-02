import { FaceAvatar } from '../noble/FaceAvatar';
import { PatternSwatch } from './QuizBackground';
import { TEACHERS, TEACHER_IDS, TEACHER_VOICE_ENABLED, teacherImage } from '../../lib/teachers';
import { useChatTeacher } from '../../lib/chatTeacher';
import {
  QUIZ_BACKGROUND_COLORS, QUIZ_BACKGROUND_COLOR_IDS, QUIZ_BACKGROUND_IDS, QUIZ_BACKGROUND_LABEL,
  useQuizBackground, useQuizBackgroundColor,
} from '../../lib/quizBackground';
import { usePortraitTone } from '../../lib/portraitTone';

// 単語クイズの設定パネルの下に置く「先生」「背景」の2行。
// 値は端末ごと（localStorage。chatTeacher.ts / quizBackground.ts）。先生の絵は今の画風（usePortraitTone）で出す。
// この2つは出題に関係しないので、設定変更で setupQuiz を再実行する useEffect の依存には入れない。

// 選択中の強調は NobleStatsDashboard の「肖像の雰囲気」ピルと同じ配色（枠は 2px）
const pillStyle = (active: boolean) => ({
  borderColor: active ? 'var(--rw-primary)' : 'var(--rw-rule)',
  background: active ? 'var(--rw-primary-soft)' : 'transparent',
  color: active ? 'var(--rw-primary)' : 'var(--rw-ink-soft)',
});

export function QuizLookSettings({ className = '' }: { className?: string }) {
  const [teacher, setTeacher] = useChatTeacher();
  const [background, setBackground] = useQuizBackground();
  const [bgColor, setBgColor] = useQuizBackgroundColor();
  const [tone] = usePortraitTone();

  return (
    <div className={`mt-1 pt-2 border-t border-rw-rule space-y-2 ${className}`}>
      <div>
        <div className="text-[10px] font-bold text-rw-ink-soft mb-1">先生</div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label="答え合わせの先生">
          {TEACHER_IDS.map((id) => {
            const t = TEACHERS[id];
            const active = id === teacher;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTeacher(id)}
                aria-pressed={active}
                title={`${t.name}（${t.title}）— ${t.oneLiner}`}
                className="shrink-0 flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl border-2 transition"
                style={pillStyle(active)}
              >
                <FaceAvatar src={teacherImage(id, tone)} size={40} alt="" />
                <span className="text-[10px] font-bold leading-none">{t.name}</span>
              </button>
            );
          })}
        </div>
        {/* 選んでいる先生の人物像（口調の根拠。史実の範囲内） */}
        {TEACHER_VOICE_ENABLED && (
        <p className="mt-1.5 text-[11px] leading-snug text-rw-ink-soft">
          <span className="font-bold text-rw-ink">{TEACHERS[teacher].name}</span>
          <span className="text-rw-ink-soft">（{TEACHERS[teacher].title}）</span>
          — {TEACHERS[teacher].profile}
        </p>
        )}
      </div>
      <div>
        <div className="text-[10px] font-bold text-rw-ink-soft mb-1">背景</div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="クイズ画面の背景">
          {QUIZ_BACKGROUND_IDS.map((id) => {
            const active = id === background;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setBackground(id)}
                aria-pressed={active}
                className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-xl border-2 transition"
                style={pillStyle(active)}
              >
                <PatternSwatch pattern={id} color={bgColor} width={40} height={28} scale={0.6} className="rounded border border-rw-rule shrink-0" />
                <span className="text-[11px] font-bold">{QUIZ_BACKGROUND_LABEL[id]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold text-rw-ink-soft mb-1">色</div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="背景の色">
          {QUIZ_BACKGROUND_COLOR_IDS.map((id) => {
            const c = QUIZ_BACKGROUND_COLORS[id];
            const active = id === bgColor;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setBgColor(id)}
                aria-pressed={active}
                className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border-2 transition"
                style={pillStyle(active)}
              >
                <span
                  className="w-5 h-5 rounded-full border"
                  style={{ background: c.bg, borderColor: c.line, boxShadow: `inset 0 0 0 3px ${c.line}` }}
                />
                <span className="text-[11px] font-bold">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default QuizLookSettings;
