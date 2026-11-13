import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import bundledKobunQ from '@/data/kobunQ.v2.slim.json';
import whyJson from '@/data/vocab-why.json';
import { loadExampleBank, groupBySense, dedupeExamples, type BankExample } from '@/lib/exampleBank';
import { getPublishedSlugs } from '@/lib/textPublications';
import { hasFullAccess } from '@/lib/fullAccess';
import textsIndex from '@/data/textsIndex.json';
import { logEvent } from '@/lib/learningEvents';
import { ChatRow, CHAT_AVATAR_PX, type ChatRowTone } from '@/components/quiz/ChatRow';
import { QuizBackground } from '@/components/quiz/QuizBackground';
import { scrollBehavior } from '@/components/quiz/writingVerdict';
import { FaceAvatar } from '@/components/noble/FaceAvatar';
import { TEACHERS, teacherImage } from '@/lib/teachers';
import { useChatTeacher } from '@/lib/chatTeacher';
import { usePortraitTone } from '@/lib/portraitTone';
import { useTeacherArt } from '@/lib/teacherArt';
import { readMyStage } from '@/lib/myStage';
import { QUIZ_BACKGROUND_COLORS, useQuizBackground, useQuizBackgroundColor } from '@/lib/quizBackground';
import { addAsk, askKey, buildCardMenu, isMenuEmpty, type CardAsk } from '@/lib/kobun/vocabCardChat';
import { makeReturnTo, quizUrlWithReturn, wordCardBack } from '@/lib/returnTo';

// 単語理解カード（B型：核から意味を見ていく／案1「なぜ」ラベル帯）。
// 「問う前に読んで理解する場所」。答え合わせ後のパネル(WordInsightPanel)とは別に、
// 語の意味が核からどう分かれるか＝なぜその意味になるかを示す。
//
// 見た目は会話式（2026-11-06、ユーザー指示「ここは会話にして」）。単語クイズの答え合わせと同じ吹き出しで、
// 左＝先生（核イメージ・意味と例文・理由・用例・現代語の罠）、右＝自分（聞いたこと）。
// 会話は決まった順に進めず、生徒が聞きたいことを選ぶ（同日「順になるのではなく、選択肢的に選べるように」）。
// 選んだ順に会話が下へ伸び、いちばん下に「まだ聞いていないこと」の選択肢が残る。
// 何を選べるかは lib/kobun/vocabCardChat.ts（意味はどれからでも／理由・用例はその意味を見たあと／罠はいつでも）。
// 中身とデータは従来のカードと同じ。先生は中身だけを話す（人物の口調の台詞は足していない）。
// 先生・画風・背景は単語クイズの設定（kobun.chat.*・肖像の画風）をそのまま使う。吹き出しの部品 = components/quiz/ChatRow。
//
// データ源：
//   kobunQ v2 (slim) … lemma/sense/senseCore/decider/trap/examples（語・qid 不変）
//   vocab-why.json    … 核→各意味の「なぜ」（手検証・照合済みの語のみ。捏造禁止）
//   example-bank      … 意味ごとの用例（教材本文由来はその本文へ飛べる）

interface Example { jp: string; translation: string; source?: string }
interface Sense {
  qid: string;
  lemma: string;
  sense: string;
  senseNorm?: string;
  meaning_idx?: number;
  senseCore?: string;
  decider?: { clue: string; rule: string };
  trap?: { modern: string; note: string };
  examples?: Example[];
}
const ALL = bundledKobunQ as unknown as Sense[];

interface WhyWord {
  kind?: string;
  axis?: string;
  senses?: Record<string, { from?: string; why?: string }>;
  trapWhy?: string;
}
const WHY = (whyJson as { words: Record<string, WhyWord> }).words;

// 本文へのリンク用（id → タイトル）。公開されている教材だけリンクする。
const TEXT_TITLES: Record<string, string> = (
  textsIndex as Array<{ id: string; title: string }>
).reduce((acc, t) => {
  acc[t.id] = t.title;
  return acc;
}, {} as Record<string, string>);

function stripBrackets(s: string): string {
  const m = (s || '').match(/〔\s*(.+?)\s*〕/);
  return (m ? m[1] : s || '').trim();
}
function cleanJp(jp: string, source?: string): string {
  let t = jp || '';
  if (source) t = t.replace(new RegExp('（' + source + '）\\s*$'), '');
  return t.trim();
}
function cleanTr(tr: string): string {
  // 用例バンクには半角の (訳) で始まる訳もある
  return (tr || '').replace(/^\s*[（(]訳[）)]\s*/, '').trim();
}
const jpKey = (jp?: string) => (jp || '').replace(/\s+/g, '').replace(/[【】〔〕]/g, '');

export default function VocabCard() {
  const { lemma: rawLemma } = useParams();
  const lemma = decodeURIComponent(rawLemma || '');
  // 戻るリンクは来た所へ（2026-11-06）。教材の語のカードから来たときは ?back=<教材のパス> が付いていて、
  // その教材のその語へ戻す。無ければ今までどおり単語ホーム
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const back = wordCardBack(searchParams.get('back'));

  const senses = useMemo(
    () =>
      ALL.filter((s) => s.lemma === lemma).sort(
        (a, b) => (a.meaning_idx ?? 0) - (b.meaning_idx ?? 0),
      ),
    [lemma],
  );

  // 「つづきから」用に最後に開いた語を記録
  useEffect(() => {
    if (senses.length > 0) {
      try { localStorage.setItem('kobun-vocab-last-lemma', lemma); } catch { /* noop */ }
      logEvent({ area: 'vocab', action: 'view', targetType: 'lemma', targetId: lemma });
    }
  }, [lemma, senses.length]);

  // 用例バンク（意味ごと）。語を開いたときに1ファイルだけ読む
  const [bank, setBank] = useState<Record<string, BankExample[]>>({});
  const [publishedSet, setPublishedSet] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadExampleBank(lemma).then((b) => {
      if (!cancelled) setBank(groupBySense(b));
    });
    getPublishedSlugs().then((s) => {
      if (!cancelled) setPublishedSet(s);
    });
    return () => {
      cancelled = true;
    };
  }, [lemma]);

  const fullAccess = hasFullAccess();
  const canOpenText = (textId?: string) => {
    if (!textId || !TEXT_TITLES[textId]) return false;
    if (fullAccess) return true;
    // 表が無い（null）ときは制限なし扱い。textPublications と同じ方針
    return publishedSet == null || publishedSet.has(textId);
  };

  const why = WHY[lemma];
  const core = senses.find((s) => s.senseCore)?.senseCore;
  const trap = senses.find((s) => s.trap)?.trap;

  // 意味ごとの中身（見出し・最初の例文・理由・ほかの用例）
  const infos = useMemo(
    () =>
      senses.map((s) => {
        const w = why?.senses?.[s.qid];
        const ex = s.examples?.[0];
        // この意味の用例（kobunQ の1例と重複するものは落とす）
        const shown = jpKey(ex?.jp);
        const more = dedupeExamples(bank[s.qid] ?? []).filter((b) => jpKey(b.jp) !== shown);
        return {
          qid: s.qid,
          label: s.senseNorm || stripBrackets(s.sense),
          from: w?.from,
          ex,
          whyText: w?.why || s.decider?.rule,
          more,
        };
      }),
    [senses, why, bank],
  );
  const infoByQid = useMemo(() => new Map(infos.map((i) => [i.qid, i])), [infos]);

  // 会話の見た目（単語クイズの答え合わせと同じ設定を使う）
  const [teacherId] = useChatTeacher();
  const teacher = TEACHERS[teacherId];
  const [tone] = usePortraitTone();
  const [teacherArt] = useTeacherArt();
  const [background] = useQuizBackground();
  const [backgroundColor] = useQuizBackgroundColor();
  const myStage = useMemo(() => readMyStage(), []);

  // 聞いたこと（選んだ順）。別の語へ移ったら最初から
  const [asked, setAsked] = useState<CardAsk[]>([]);
  useEffect(() => {
    setAsked([]);
  }, [lemma]);
  const ask = (a: CardAsk) => setAsked((prev) => addAsk(prev, a));
  // 選ぶと、その問いと答えが画面の上端に来る（単語クイズの答え合わせと同じ。開いた直後は動かさない）
  const lastRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asked.length > 0) lastRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, [asked.length]);

  if (senses.length === 0) {
    return (
      <div className="min-h-dvh bg-rw-bg">
        <div className="max-w-2xl mx-auto px-5 py-8">
          <Link to={back.path} className="text-sm font-semibold text-rw-ink-soft">{back.label}</Link>
          <p className="mt-6 text-rw-ink font-bold">「{lemma}」は見つかりませんでした。</p>
        </div>
      </div>
    );
  }

  const menu = buildCardMenu(
    infos.map((i) => ({ qid: i.qid, label: i.label, hasReason: !!i.whyText, moreExamples: i.more.length })),
    !!trap,
    asked,
  );

  // 会話の両側。先生・画風・自分の顔・背景は単語クイズの設定（端末ごと）と同じものを使う
  const teacherAvatar = (
    <FaceAvatar src={teacherImage(teacherId, tone, teacherArt)} size={CHAT_AVATAR_PX} alt={teacher.name} className="mt-4" />
  );
  const myName = `${myStage.rank} ・ あなた`;
  const myAvatar = (
    <FaceAvatar stageN={myStage.n} tone={tone} size={CHAT_AVATAR_PX} alt={`あなた（${myStage.rank}）`} className="mt-4" />
  );
  // 吹き出しの共通の属性（部品をこの関数の中で作ると描き直しのたびに作り直され、せり上がりが毎回走るので、属性だけ持つ）
  const tProps = { side: 'teacher' as const, name: teacher.name, avatar: teacherAvatar };
  const meProps = { side: 'me' as const, name: myName, avatar: myAvatar };
  const coreTone: ChatRowTone = 'core';
  const trapTone: ChatRowTone = 'trap';
  // 選択肢のボタン
  const chip = 'text-[13px] font-black px-3 py-1.5 rounded-full border-2 border-rw-primary bg-rw-paper text-rw-ink transition hover:-translate-y-0.5';
  const chipCaption = 'text-[10.5px] font-black text-rw-ink-soft';

  // 聞いたこと1つぶんの会話（自分の吹き出し＋先生の答え）
  const exchange = (a: CardAsk) => {
    if (a.kind === 'trap') {
      if (!trap) return null;
      return (
        <>
          <ChatRow {...meProps}>現代語はどこから</ChatRow>
          <ChatRow {...tProps} tone={trapTone}>
            <p>現代語の罠</p>
            <p className="mt-0.5">⚠ {why?.trapWhy || `現代語「${trap.modern}」の罠 — ${trap.note}`}</p>
          </ChatRow>
        </>
      );
    }
    const info = infoByQid.get(a.qid);
    if (!info) return null;
    if (a.kind === 'sense') {
      return (
        <>
          <ChatRow {...meProps}>{info.label}</ChatRow>
          <ChatRow {...tProps}>
            <p className="text-[16px] font-black">
              {info.label}
              {info.from && <span className="ml-2 text-[12px] font-semibold text-rw-ink-soft">{info.from}</span>}
            </p>
            {info.ex && (
              <>
                <p className="mt-1 font-serif text-[14px] leading-loose">
                  {cleanJp(info.ex.jp, info.ex.source)}
                  {info.ex.source && <span className="ml-1 font-sans text-[11.5px] text-rw-ink-soft">／{info.ex.source}</span>}
                </p>
                <p className="mt-0.5">→ {cleanTr(info.ex.translation)}</p>
              </>
            )}
          </ChatRow>
        </>
      );
    }
    if (a.kind === 'reason') {
      if (!info.whyText) return null;
      return (
        <>
          <ChatRow {...meProps}>「{info.label}」の理由を見る</ChatRow>
          <ChatRow {...tProps} tone={coreTone}>{info.whyText}</ChatRow>
        </>
      );
    }
    if (info.more.length === 0) return null;
    return (
      <>
        <ChatRow {...meProps}>「{info.label}」の用例をもっと見る</ChatRow>
        <ChatRow {...tProps}>
          <div className="space-y-2">
            {info.more.slice(0, 8).map((b, j) => {
              const linkable = b.origin === 'text' && canOpenText(b.textId);
              return (
                <div key={`${info.qid}-ex-${j}`} className={j > 0 ? 'pt-2 border-t border-rw-rule' : undefined}>
                  <p className="font-serif text-[13.5px] leading-loose">
                    {cleanJp(b.jp, b.source)}
                    {b.source && <span className="ml-1 font-sans text-[11.5px] text-rw-ink-soft">／{b.source}</span>}
                  </p>
                  {b.translation && <p className="mt-0.5 text-[12.5px]">→ {cleanTr(b.translation)}</p>}
                  {linkable && (
                    <Link
                      to={`/read/texts/${b.textId}`}
                      className="inline-block mt-1 text-[12px] font-black text-rw-accent no-underline"
                      style={{ textDecoration: 'none' }}
                    >
                      本文で読む →
                    </Link>
                  )}
                </div>
              );
            })}
            {info.more.length > 8 && <p className="text-[12px] text-rw-ink-soft">ほか {info.more.length - 8} 例</p>}
          </div>
        </ChatRow>
      </>
    );
  };

  return (
    <div className="min-h-dvh" style={{ background: QUIZ_BACKGROUND_COLORS[backgroundColor]?.bg ?? 'var(--rw-bg)' }}>
      {/* 和柄の背景（単語クイズと同じ設定）。固定の SVG を z 0 に敷き、中身は relative z-[1] で上に出す */}
      <QuizBackground pattern={background} color={backgroundColor} />
      <div className="relative z-[1] max-w-2xl mx-auto px-4 py-6">
        <header className="mb-4">
          <Link to={back.path} className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">
            {back.label}
          </Link>
          {/* 見出し */}
          <div className="mt-3 flex items-baseline gap-2">
            <h1 className="text-[30px] font-black tracking-wide text-rw-ink leading-none">{lemma}</h1>
            {senses[0]?.decider && (
              <span className="text-[12px] font-bold text-rw-ink-soft">— その意味になる理由を見る</span>
            )}
          </div>
        </header>

        {/* 会話（単語クイズの答え合わせと同じ見た目）。核イメージ → 選んだ順の問いと答え → まだ聞いていないことの選択肢 */}
        <div aria-live="polite" className="flex flex-col gap-2.5">
          {/* 核イメージ */}
          {core ? (
            <ChatRow {...tProps} tone={coreTone}>
              <p>核イメージ</p>
              <p className="mt-0.5 font-semibold">
                🧭 <b>{lemma}</b>＝{core}
              </p>
              {why?.axis && <p className="mt-0.5 text-rw-ink-soft font-semibold">{why.axis}</p>}
            </ChatRow>
          ) : (
            <ChatRow {...tProps}>
              「{lemma}」の意味は{senses.length}つ。
            </ChatRow>
          )}

          {/* 聞いたこと（選んだ順） */}
          {asked.map((a, i) => (
            <div
              key={askKey(a)}
              ref={i === asked.length - 1 ? lastRef : undefined}
              className="flex flex-col gap-2.5"
              style={{ scrollMarginTop: 8 }}
            >
              {exchange(a)}
            </div>
          ))}
        </div>

        {/* まだ聞いていないこと（選択肢）。意味はどれからでも、理由・用例はその意味を見たあと、現代語の罠はいつでも */}
        {!isMenuEmpty(menu) && (
          <div className="mt-2.5">
            <ChatRow {...meProps} bare>
              <div className="flex flex-col items-end gap-2">
                {menu.senses.length > 0 && (
                  <div className="flex flex-col items-end gap-1">
                    <p className={chipCaption}>{asked.length === 0 ? '見たい意味を選ぶ' : 'ほかの意味'}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      {menu.senses.map((s) => (
                        <button key={s.qid} type="button" onClick={() => ask({ kind: 'sense', qid: s.qid })} className={chip}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {menu.followUps.map((f) => (
                  <div key={f.qid} className="flex flex-col items-end gap-1">
                    <p className={chipCaption}>「{f.label}」について</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      {f.reason && (
                        <button type="button" onClick={() => ask({ kind: 'reason', qid: f.qid })} className={chip}>
                          理由を見る
                        </button>
                      )}
                      {f.examples > 0 && (
                        <button type="button" onClick={() => ask({ kind: 'examples', qid: f.qid })} className={chip}>
                          用例をもっと見る（{f.examples}）
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {menu.trap && (
                  <button type="button" onClick={() => ask({ kind: 'trap' })} className={chip}>
                    現代語はどこから
                  </button>
                )}
              </div>
            </ChatRow>
          </div>
        )}

        {/* 読んだあとの次の一手（2026-11-06）。選択肢を全部聞き終えても残る、いつでも押せるリンク。
            この見出し語の全部の意味を単語クイズで出し、クイズからはこのカードへ戻れる（戻り先＝今のカードのパス） */}
        <div className="mt-4 text-right">
          <Link
            to={quizUrlWithReturn(senses.map((s) => s.qid), makeReturnTo(location.pathname, location.search))}
            className="inline-block text-[12.5px] font-black text-rw-accent no-underline"
            style={{ textDecoration: 'none' }}
          >
            この語をクイズで確かめる →
          </Link>
        </div>
      </div>
    </div>
  );
}
