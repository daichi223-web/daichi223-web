import { useEffect, useMemo, useState } from 'react';
import { ChatRow, CHAT_AVATAR_PX } from './ChatRow';
import { FaceAvatar } from '../noble/FaceAvatar';
import { TEACHERS, teacherImage } from '../../lib/teachers';
import { useChatTeacher } from '../../lib/chatTeacher';
import { usePortraitTone } from '../../lib/portraitTone';
import { pickGreeting } from '../../lib/teacherGreetings';
import { pickPromotion, rankFullName } from '../../lib/teacherPromotions';
import { daysUntil } from '../../lib/quizRange';

// 先生の季節・行事のあいさつ（1行の吹き出し）。中身は lib/teacherGreetings.ts の pickGreeting。
// 先生・絵の雰囲気は単語クイズの設定と同じものを使う。小テストの期日があれば「あと N 日」を優先する。
// 出すかどうかは呼ぶ側が TEACHER_VOICE_ENABLED で決める（台詞の口調と同じ切り替え）。
// 2026-11-13 ユーザー指示「ホームに戻るたびに変わるように」：画面に出るたびに選び直し、直前に出した一言は避ける。
// 同じ画面にいる間（描き直し）は同じ一言のまま。先生の絵をタップすると onAvatarClick（ホームでは先生を選ぶ欄を開く）。

// 直前に出した一言（ページを開いている間だけ覚える）
let lastShown: string | null = null;
// 画面に出た回数（選び直しの種）
let shownCount = 0;

type Props = {
  /** 小テストの期日（quiz_ranges.due_date、YYYY-MM-DD）。無ければ null */
  quizDueDate?: string | null;
  className?: string;
  /** 先生の絵をタップしたとき（無ければ絵は押せない） */
  onAvatarClick?: () => void;
  /** 昇進した直後なら、新しい階位（季節のあいさつの代わりにお祝いを言う。lib/teacherPromotions.ts） */
  promotion?: { n: number; rank: string } | null;
};

export function TeacherGreeting({ quizDueDate = null, className = '', onAvatarClick, promotion = null }: Props) {
  const [teacher] = useChatTeacher();
  const [tone] = usePortraitTone();
  // 画面に出るたびに種を1つ進め、そのときの「直前の一言」を避ける対象として持つ（どちらも出たときに1回だけ決まる）
  const [visit] = useState(() => ++shownCount);
  const [avoid] = useState(() => lastShown);
  // 同じ訪問の中（描き直し）では同じ一言。先生を変えたら同じ種で選び直す
  const promoLine = useMemo(
    () => (promotion ? pickPromotion({ teacher, n: promotion.n, rank: promotion.rank, seed: `visit${visit}` }) : null),
    [teacher, promotion, visit],
  );
  const greetingLine = useMemo(
    () => pickGreeting({ teacher, date: new Date(), quizDaysLeft: daysUntil(quizDueDate), seed: `visit${visit}`, avoid }),
    [teacher, quizDueDate, visit, avoid],
  );
  // 昇進のお祝いがあればそれを優先（台詞の無い先生は季節のあいさつ）
  const line = promoLine ?? greetingLine;
  useEffect(() => {
    if (!promoLine) lastShown = greetingLine;
  }, [promoLine, greetingLine]);
  if (!line) return null;

  const t = TEACHERS[teacher];
  const avatar = <FaceAvatar src={teacherImage(teacher, tone)} size={CHAT_AVATAR_PX} alt={t.name} className={onAvatarClick ? '' : 'mt-4'} />;
  return (
    <div className={className} data-testid="teacher-greeting">
      <ChatRow
        side="teacher"
        name={t.name}
        tone={promoLine ? 'core' : 'plain'}
        avatar={
          onAvatarClick ? (
            <button
              type="button"
              onClick={onAvatarClick}
              className="mt-4 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rw-primary"
              aria-label={`${t.name}（先生を選ぶ）`}
              title="先生を選ぶ"
            >
              {avatar}
            </button>
          ) : (
            avatar
          )
        }
      >
        {promoLine && promotion && (
          <span className="block text-[10px] font-black text-rw-accent mb-0.5">昇進 ― {rankFullName(promotion.rank)}</span>
        )}
        {line}
      </ChatRow>
    </div>
  );
}

export default TeacherGreeting;
