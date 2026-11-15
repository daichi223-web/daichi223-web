import { ChatRow, CHAT_AVATAR_PX } from './ChatRow';
import { FaceAvatar } from '../noble/FaceAvatar';
import { TEACHERS, teacherImage } from '../../lib/teachers';
import { useChatTeacher } from '../../lib/chatTeacher';
import { usePortraitTone } from '../../lib/portraitTone';

// 先生のガイド（学び始め・文法道場の要所で一言。文は lib/kobun/teacherGuide.ts）。
// 先生と絵の雰囲気は単語クイズの設定と同じ。1文＝1つの吹き出しで、名前とアイコンは最初の吹き出しにだけ付ける。
// 出すかどうかは呼ぶ側が TEACHER_VOICE_ENABLED で決める。

export function TeacherGuide({ lines, className = '' }: { lines: string[]; className?: string }) {
  const [teacher] = useChatTeacher();
  const [tone] = usePortraitTone();
  if (lines.length === 0) return null;
  const t = TEACHERS[teacher];
  return (
    <div className={`space-y-1 ${className}`} data-testid="teacher-guide">
      {lines.map((line, i) => (
        <ChatRow
          key={`${i}:${line}`}
          side="teacher"
          name={i === 0 ? t.name : ''}
          avatar={
            i === 0 ? (
              <FaceAvatar src={teacherImage(teacher, tone)} size={CHAT_AVATAR_PX} alt={t.name} className="mt-4" />
            ) : (
              <span className="shrink-0" style={{ width: CHAT_AVATAR_PX }} aria-hidden />
            )
          }
        >
          {line}
        </ChatRow>
      ))}
    </div>
  );
}

export default TeacherGuide;
