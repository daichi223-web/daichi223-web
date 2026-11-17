import { useState } from 'react';
import { FaceAvatar } from '../noble/FaceAvatar';
import { TeacherDetailSheet } from './TeacherDetailSheet';
import { PatternSwatch } from './QuizBackground';
import {
  GUEST_TEACHER_IDS, TEACHERS, TEACHER_IDS, TEACHER_VOICE_ENABLED, teacherImage, type TeacherId,
} from '../../lib/teachers';
import { useChatTeacher } from '../../lib/chatTeacher';
import { GUEST_UNLOCK_HINT, useUnlockedTeachers } from '../../lib/workTeachers';
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

// たたんだときに並べる人数。選んでいる先生がこの中にいなければ、最後の1人と入れ替える
export const COLLAPSED_COUNT = 5;

export function collapsedTeachers(available: readonly TeacherId[], selected: TeacherId): TeacherId[] {
  const head = available.slice(0, COLLAPSED_COUNT);
  if (head.includes(selected) || !available.includes(selected)) return head;
  return [selected, ...head.slice(0, COLLAPSED_COUNT - 1)];
}

export function QuizLookSettings({ className = '' }: { className?: string }) {
  const [teacher, setTeacher] = useChatTeacher();
  const [background, setBackground] = useQuizBackground();
  const [bgColor, setBgColor] = useQuizBackgroundColor();
  const [tone] = usePortraitTone();
  const unlocked = useUnlockedTeachers();
  const [expanded, setExpanded] = useState(false);
  const available: TeacherId[] = [...TEACHER_IDS, ...GUEST_TEACHER_IDS.filter((id) => unlocked.includes(id))];
  const locked = GUEST_TEACHER_IDS.filter((id) => !unlocked.includes(id));
  const collapsed = collapsedTeachers(available, teacher);
  const shown = expanded ? available : collapsed;
  const hiddenCount = available.length - collapsed.length + locked.length;
  // 先生をタップすると人物解説が開く（選ぶのは解説の中の「この先生にする」。2026-11-12 ユーザー指示）
  const [detail, setDetail] = useState<TeacherId | null>(null);

  return (
    <div className={`mt-1 pt-2 border-t border-rw-rule space-y-2 ${className}`}>
      <div>
        <div className="text-[10px] font-bold text-rw-ink-soft mb-1">先生</div>
        {/* 先生が増えると選びにくいので、たたんだときは COLLAPSED_COUNT 人だけ（選んでいる先生は必ず入れる）。
            「もっと」で全員と、まだ手に入れていない教材の先生（🔒）を開く（2026-11-17 ユーザー指示） */}
        <div
          className={expanded ? 'flex gap-2 flex-wrap' : 'flex gap-2 overflow-x-auto scrollbar-hide'}
          role="group"
          aria-label="答え合わせの先生"
        >
          {shown.map((id) => {
            const t = TEACHERS[id];
            const active = id === teacher;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setDetail(id)}
                aria-pressed={active}
                aria-haspopup="dialog"
                title={`${t.name}（${t.title}）— ${t.oneLiner}`}
                className="shrink-0 flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl border-2 transition"
                style={pillStyle(active)}
              >
                <FaceAvatar src={teacherImage(id, tone)} size={40} alt="" />
                <span className="text-[10px] font-bold leading-none">{t.name}</span>
              </button>
            );
          })}
          {/* 教材の先生：その教材の読解テストをクリアすると選べる（workTeachers.ts）。まだのときは鍵つきで、条件だけ見せる */}
          {expanded && locked.map((id) => (
            <div
              key={id}
              title={`${GUEST_UNLOCK_HINT[id]}で先生になります`}
              aria-label={`まだ手に入れていない先生：${GUEST_UNLOCK_HINT[id]}で加わります`}
              className="shrink-0 flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl border-2 border-dashed"
              style={{ borderColor: 'var(--rw-rule)', color: 'var(--rw-ink-soft)', maxWidth: 96 }}
            >
              <span className="relative">
                <span style={{ filter: 'grayscale(1) brightness(0.35)', opacity: 0.5, display: 'block' }}>
                  <FaceAvatar src={teacherImage(id, tone)} size={40} alt="" />
                </span>
                <span className="absolute inset-0 flex items-center justify-center text-base" aria-hidden>🔒</span>
              </span>
              <span className="text-[9px] font-bold leading-tight text-center">{GUEST_UNLOCK_HINT[id]}</span>
            </div>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="shrink-0 flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl border-2 transition"
              style={pillStyle(false)}
            >
              <span className="text-base leading-none" aria-hidden>{expanded ? '▲' : '…'}</span>
              <span className="text-[10px] font-bold leading-none">{expanded ? 'たたむ' : `もっと（${hiddenCount}）`}</span>
            </button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-rw-ink-soft">
          先生をタップすると、人物の解説が開きます。{expanded && locked.length > 0 && '🔒の先生は、教材の読解テストをクリアすると加わります。'}
        </p>
        {/* 先生の絵は、テーマの「あなたのキャラ」（絵の雰囲気）に合わせて変わる。みやびもそこで選ぶ（2026-11-13 ユーザー指示で一本化） */}
        <TeacherDetailSheet id={detail} tone={tone} selected={detail === teacher} onSelect={setTeacher} onClose={() => setDetail(null)} />
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
