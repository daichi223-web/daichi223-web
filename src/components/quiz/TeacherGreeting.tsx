import { useMemo } from 'react';
import { ChatRow, CHAT_AVATAR_PX } from './ChatRow';
import { FaceAvatar } from '../noble/FaceAvatar';
import { TEACHERS, teacherImage } from '../../lib/teachers';
import { useChatTeacher } from '../../lib/chatTeacher';
import { usePortraitTone } from '../../lib/portraitTone';
import { pickGreeting } from '../../lib/teacherGreetings';
import { daysUntil } from '../../lib/quizRange';

// 先生の季節・行事のあいさつ（1行の吹き出し）。中身は lib/teacherGreetings.ts の pickGreeting。
// 先生・画風・絵の種類は単語クイズの設定と同じものを使う。小テストの期日があれば「あと N 日」を優先する。
// 出すかどうかは呼ぶ側が TEACHER_VOICE_ENABLED で決める（台詞の口調と同じ切り替え）。
// 同じ日は同じ一言（pickGreeting は日付で決まる）。場面ごとに変えたいときは seed を渡す。

type Props = {
  /** 小テストの期日（quiz_ranges.due_date、YYYY-MM-DD）。無ければ null */
  quizDueDate?: string | null;
  seed?: string;
  className?: string;
};

export function TeacherGreeting({ quizDueDate = null, seed = '', className = '' }: Props) {
  const [teacher] = useChatTeacher();
  const [tone] = usePortraitTone();
  const today = new Date();
  const dayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

  const line = useMemo(
    () => pickGreeting({ teacher, date: new Date(), quizDaysLeft: daysUntil(quizDueDate), seed }),
    // 日付が変わったら選び直す（dayKey）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teacher, quizDueDate, seed, dayKey],
  );
  if (!line) return null;

  const t = TEACHERS[teacher];
  return (
    <div className={className} data-testid="teacher-greeting">
      <ChatRow
        side="teacher"
        name={t.name}
        avatar={<FaceAvatar src={teacherImage(teacher, tone)} size={CHAT_AVATAR_PX} alt={t.name} className="mt-4" />}
      >
        {line}
      </ChatRow>
    </div>
  );
}

export default TeacherGreeting;
