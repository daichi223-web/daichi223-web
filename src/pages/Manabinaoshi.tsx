import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { GrammarDrill, GrammarTopic } from "@/lib/kobun/types";
import { fetchJsonAsset } from "@/lib/fetchJson";
import { fetchDojoTopicIds, fetchDrillsForTopics } from "@/lib/kobun/dojoData";
import {
  STAGES,
  isCorrect,
  judgePlacement,
  limitChoices,
  pickPlacementDrills,
  shouldStop,
  stageStyle,
  type PlacementItem,
  type Stage,
  type StageId,
  type StageStyle,
  type TermCard,
} from "@/lib/kobun/manabinaoshi";
import { logEvent, markQuestionShown } from "@/lib/learningEvents";

/** 例文の【】（問われている語）を太字に、《》（手がかり）は印だけ外す */
function renderContext(text: string) {
  return text.split(/(【[^】]*】)/).map((p, i) =>
    p.startsWith("【") ? (
      <span key={i} className="font-black text-rw-primary border-b-4" style={{ borderColor: "var(--rw-primary)" }}>
        {p.slice(1, -1)}
      </span>
    ) : (
      <span key={i}>{p.replace(/[《》]/g, "")}</span>
    )
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ChoiceButtons({
  choices,
  answer,
  selected,
  onSelect,
}: {
  choices: string[];
  answer: string | string[];
  selected: string | null;
  onSelect: (c: string) => void;
}) {
  const answered = selected !== null;
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {choices.map((c) => {
        let cls = "bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-accent";
        if (answered) {
          if (isCorrect(answer, c)) cls = "bg-rw-accent border-rw-accent text-rw-paper";
          else if (selected === c) cls = "bg-rw-primary border-rw-primary text-rw-paper";
          else cls = "bg-rw-paper border-rw-rule text-rw-ink-soft opacity-60";
        }
        return (
          <button
            key={c}
            onClick={() => !answered && onSelect(c)}
            disabled={answered}
            className={`w-full text-left px-4 py-2.5 rounded-xl border-2 text-[15px] font-bold transition ${cls}`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

/** 用語カード: やさしい説明＋例＋確認の1問。retry なら間違えたあと同じ問いに答え直す */
function TermCardView({
  card,
  stage,
  style,
  onAnswered,
  onSolved,
}: {
  card: TermCard;
  stage: StageId;
  style: StageStyle;
  onAnswered: (id: string, ok: boolean) => void;
  onSolved: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const choices = useMemo(
    () => shuffle(limitChoices(card.check.choices, card.check.answer, style.maxChoices)),
    [card.id, attempt, style.maxChoices]
  );
  const ok = selected !== null && selected === card.check.answer;
  return (
    <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-4">
      <div className="text-lg font-black text-rw-ink tracking-tight">{card.term}</div>
      <p className="text-[14px] text-rw-ink leading-relaxed mt-1">{card.plain}</p>
      <div className="mt-2 space-y-1">
        {card.examples.map((ex, i) =>
          Array.isArray(ex) ? (
            <div key={i} className="flex gap-2 text-[13px] leading-snug">
              <span className="font-black text-rw-ink shrink-0 min-w-[7em]">{ex[0]}</span>
              <span className="text-rw-ink font-serif">{ex[1]}</span>
            </div>
          ) : (
            <div key={i} className="text-[13px] text-rw-ink font-serif leading-snug">{ex}</div>
          )
        )}
      </div>
      <div className="border-t border-rw-rule mt-3 pt-3">
        <p className="text-[14px] font-black text-rw-ink mb-2">✅ {card.check.prompt}</p>
        <ChoiceButtons
          choices={choices}
          answer={card.check.answer}
          selected={selected}
          onSelect={(c) => {
            setSelected(c);
            const good = c === card.check.answer;
            logEvent({
              area: "grammar", action: "answer", targetType: "term", targetId: card.id,
              correct: good, chosen: c, format: "term-check",
              ctx: { mode: "manabinaoshi", stage, attempt },
            });
            if (attempt === 0) onAnswered(card.id, good);
            if (good || !style.retry) onSolved(card.id);
          }}
        />
        {selected !== null && (
          <p className={`text-[13px] mt-2 leading-relaxed ${ok ? "text-rw-accent" : "text-rw-primary"}`}>
            <span className="font-black">{ok ? "◯ " : "× "}</span>
            {card.check.explanation}
          </p>
        )}
        {selected !== null && !ok && style.retry && (
          <button
            onClick={() => {
              setSelected(null);
              setAttempt((a) => a + 1);
            }}
            className="mt-2 w-full px-4 py-2.5 border-2 border-rw-ink rounded-xl text-[14px] font-black text-rw-ink"
          >
            説明を読んだら、もう一度答える
          </button>
        )}
      </div>
    </div>
  );
}

interface TopicMeta {
  id: string;
  title: string;
  category: string;
}

type Phase = "choose" | "stage" | "quiz" | "result";

export default function Manabinaoshi() {
  const [phase, setPhase] = useState<Phase>("choose");
  const [stageId, setStageId] = useState<StageId>(0);
  const stage: Stage = STAGES[stageId];
  const style = stageStyle(stageId);

  // 用語カードの正誤（段ごとにリセット）
  const [termResults, setTermResults] = useState<Record<string, boolean>>({});
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const [cardIdx, setCardIdx] = useState(0);

  // 単元の一覧（道場の単元＝ドリルがあるもの）
  const [topics, setTopics] = useState<TopicMeta[] | null>(null);
  const [drills, setDrills] = useState<GrammarDrill[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // 判定
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<PlacementItem[]>([]);
  // 途中で止めたあと「続けて確かめる」を選んだら、残りは止めずに最後まで
  const [noStop, setNoStop] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await fetchDojoTopicIds();
      const list = await Promise.all(
        ids.map(async (id) => {
          const r = await fetchJsonAsset<GrammarTopic>(`/grammar/${id}.json`);
          return r.ok ? { id, title: r.data.title, category: r.data.category as string } : null;
        })
      );
      if (cancelled) return;
      const ok = list.filter((x): x is TopicMeta => x !== null);
      if (ok.length === 0) setLoadError(true);
      setTopics(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stageTopicIds = useMemo(
    () => (topics && stage.category ? topics.filter((t) => t.category === stage.category).map((t) => t.id) : []),
    [topics, stage.category]
  );
  const titleOf = (id: string) => topics?.find((t) => t.id === id)?.title ?? id;

  // 段に入ったら判定用のドリルを取っておく
  useEffect(() => {
    if (phase !== "stage" || stageTopicIds.length === 0) return;
    let cancelled = false;
    setDrills(null);
    fetchDrillsForTopics(stageTopicIds).then((ds) => {
      if (!cancelled) setDrills(pickPlacementDrills(ds, stageTopicIds));
    });
    return () => {
      cancelled = true;
    };
  }, [phase, stageTopicIds]);

  const quiz = drills ?? [];
  const drill = quiz[qIdx];
  const quizChoices = useMemo(
    () => (drill ? shuffle(limitChoices(drill.choices ?? [], drill.answer, style.maxChoices)) : []),
    [drill?.id, style.maxChoices]
  );
  useEffect(() => {
    if (phase === "quiz") markQuestionShown();
  }, [phase, qIdx]);

  const goStage = (id: StageId) => {
    setStageId(id);
    setTermResults({});
    setSolved({});
    setCardIdx(0);
    setNoStop(false);
    setItems([]);
    setQIdx(0);
    setSelected(null);
    setPhase("stage");
    window.scrollTo(0, 0);
  };

  const startQuiz = () => {
    setNoStop(false);
    setItems([]);
    setQIdx(0);
    setSelected(null);
    setPhase("quiz");
    window.scrollTo(0, 0);
  };

  const answerQuiz = (c: string) => {
    if (!drill || selected !== null) return;
    setSelected(c);
    const ok = isCorrect(drill.answer, c);
    setItems((prev) => [...prev, { id: drill.topicId, correct: ok }]);
    logEvent({
      area: "grammar", action: "answer", targetType: "drill", targetId: drill.id,
      correct: ok, chosen: c, format: drill.kind,
      ctx: { mode: "manabinaoshi", stage: stageId, topic: drill.topicId, choices: quizChoices },
    });
  };

  const nextQuiz = () => {
    if (qIdx + 1 >= quiz.length || (!noStop && shouldStop(items, style.stopAfterMisses))) {
      setPhase("result");
      window.scrollTo(0, 0);
      return;
    }
    setQIdx((i) => i + 1);
    setSelected(null);
  };

  const termItems: PlacementItem[] = stage.terms
    .filter((c) => c.id in termResults)
    .map((c) => ({ id: c.id, correct: termResults[c.id] }));
  const allTermsAnswered = termItems.length === stage.terms.length;
  const allTermsSolved = stage.terms.every((c) => solved[c.id]);
  const stepDone = style.layout === "list" || (cardIdx >= stage.terms.length - 1 && allTermsSolved);
  const termJudge = judgePlacement(termItems);
  const nextStage = STAGES[stageId + 1];
  const prevStage = stageId > 0 ? STAGES[stageId - 1] : null;

  const header = (
    <div className="flex items-center gap-4 mb-4">
      {phase === "choose" ? (
        <Link to="/" className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors">
          ← ホーム
        </Link>
      ) : (
        <button
          onClick={() => setPhase(phase === "quiz" || phase === "result" ? "stage" : "choose")}
          className="text-sm font-bold text-rw-ink-soft hover:text-rw-ink transition-colors"
        >
          ← 戻る
        </button>
      )}
      <h1 className="text-[22px] sm:text-2xl font-black text-rw-ink tracking-tight">🧭 学び直し</h1>
    </div>
  );

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto p-5">
        {header}

        {phase === "choose" && (
          <>
            <p className="text-[14px] text-rw-ink leading-relaxed mb-1">
              どこから始めればいいか、自分で選ぼう。上から順に読んで、
              <span className="font-black">「できる」と言えなくなった段</span>を選んでね。
            </p>
            <p className="text-[12px] text-rw-ink-soft leading-relaxed mb-4">
              選んだ段で短い確認をして、そこから始めていいかを判定するよ。迷ったら上の段から。
            </p>
            <div className="space-y-2.5">
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => goStage(s.id)}
                  className="w-full text-left bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 hover:bg-rw-primary-soft/40 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-rw-ink text-rw-paper text-sm font-black flex items-center justify-center shrink-0">
                      {s.id}
                    </span>
                    <span className="font-black text-rw-ink tracking-tight flex-1">{s.title}</span>
                    <span className="text-rw-ink-soft text-sm">▸</span>
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {s.canDo.map((c) => (
                      <li key={c} className="text-[13px] text-rw-ink leading-snug">
                        □ {c}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "stage" && (
          <>
            <div className="text-[11px] font-black text-rw-ink-soft tracking-wider">段 {stage.id}</div>
            <h2 className="text-xl font-black text-rw-ink tracking-tight mb-1">{stage.title}</h2>
            <p className="text-[13px] text-rw-ink-soft leading-relaxed mb-4">
              {stage.id === 0
                ? "文法の言葉を、短い説明と1問で確かめよう。わからなくても大丈夫。説明を読めば答えられるようにしてある。"
                : "この段で初めて出てくる言葉。知っている言葉は1問だけ答えて先へ。そのあと判定に進もう。"}
            </p>

            {(() => {
              const cardProps = (card: TermCard) => ({
                card,
                stage: stage.id,
                style,
                onAnswered: (id: string, ok: boolean) => setTermResults((r) => (id in r ? r : { ...r, [id]: ok })),
                onSolved: (id: string) => setSolved((r) => ({ ...r, [id]: true })),
              });
              if (style.layout === "list")
                return (
                  <div className="space-y-3">
                    {stage.terms.map((card) => (
                      <TermCardView key={`${stage.id}-${card.id}`} {...cardProps(card)} />
                    ))}
                  </div>
                );
              const card = stage.terms[cardIdx];
              const last = cardIdx >= stage.terms.length - 1;
              return (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 rounded-full bg-rw-rule overflow-hidden">
                      <div
                        className="h-full bg-rw-accent transition-all"
                        style={{ width: `${Math.round(((cardIdx + (solved[card.id] ? 1 : 0)) / stage.terms.length) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-black text-rw-ink-soft">
                      {cardIdx + 1} / {stage.terms.length}
                    </span>
                  </div>
                  <TermCardView key={`${stage.id}-${card.id}`} {...cardProps(card)} />
                  <div className="flex gap-2 mt-3">
                    {cardIdx > 0 && (
                      <button
                        onClick={() => setCardIdx((i) => i - 1)}
                        className="px-4 py-3 border-2 border-rw-rule rounded-2xl font-black text-rw-ink-soft"
                      >
                        ← 前へ
                      </button>
                    )}
                    {solved[card.id] && !last && (
                      <button
                        onClick={() => {
                          setCardIdx((i) => i + 1);
                          window.scrollTo(0, 0);
                        }}
                        className="flex-1 px-4 py-3 bg-rw-ink text-rw-paper rounded-2xl font-black"
                      >
                        つぎの言葉へ ▸
                      </button>
                    )}
                  </div>
                </>
              );
            })()}

            {!stepDone ? null : stage.id === 0 ? (
              allTermsAnswered && (
                <div className="mt-5 bg-rw-paper border-2 border-rw-ink rounded-2xl p-4">
                  <div className="font-black text-rw-ink">
                    {termJudge.correct} / {termJudge.total} 問 正解
                  </div>
                  {termJudge.startAt ? (
                    <p className="text-[13px] text-rw-ink leading-relaxed mt-1">
                      ×がついた言葉（
                      {stage.terms.filter((c) => !termResults[c.id]).map((c) => c.term).join("・")}
                      ）の説明を、もう一度読んでおこう。読めたら次の段へ。
                    </p>
                  ) : (
                    <p className="text-[13px] text-rw-ink leading-relaxed mt-1">きほんの言葉はばっちり。次の段へ進もう。</p>
                  )}
                  {nextStage && (
                    <button
                      onClick={() => goStage(nextStage.id)}
                      className="mt-3 w-full px-4 py-3 bg-rw-ink text-rw-paper rounded-2xl font-black"
                    >
                      次へ：{nextStage.id}. {nextStage.title} ▸
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="mt-5">
                {loadError ? (
                  <p className="text-[13px] text-rw-primary">単元を読み込めなかった。通信を確かめて、もう一度開いてね。</p>
                ) : drills === null ? (
                  <p className="text-[13px] text-rw-ink-soft">判定の問題を用意しています…</p>
                ) : quiz.length === 0 ? (
                  <p className="text-[13px] text-rw-primary">判定の問題を読み込めなかった。通信を確かめて、もう一度開いてね。</p>
                ) : (
                  <button
                    onClick={startQuiz}
                    className="w-full px-4 py-3 bg-rw-ink text-rw-paper rounded-2xl font-black"
                    style={{ boxShadow: "0 4px 0 var(--rw-primary)" }}
                  >
                    判定をはじめる（{quiz.length}問・各単元1問）
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {phase === "quiz" && drill && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-rw-ink-soft tracking-wider">
                判定 {qIdx + 1} / {quiz.length}
              </span>
              <span className="text-[11px] font-black text-rw-ink-soft">{titleOf(drill.topicId)}</span>
            </div>
            <div className="bg-rw-paper p-3.5 rounded-2xl border-2 border-rw-ink mb-2.5">
              {drill.context && (
                <>
                  <p className="text-rw-ink font-serif text-[15px] leading-relaxed">{renderContext(drill.context)}</p>
                  <div className="border-b border-rw-rule my-2" />
                </>
              )}
              <p className="text-[15px] font-black text-rw-ink leading-snug">{drill.prompt}</p>
            </div>
            <ChoiceButtons choices={quizChoices} answer={drill.answer} selected={selected} onSelect={answerQuiz} />
            {selected !== null && (
              <>
                {drill.explanation && (
                  <p className="text-[13px] text-rw-ink leading-relaxed mt-3 bg-rw-paper border border-rw-rule rounded-xl p-3">
                    {drill.explanation}
                  </p>
                )}
                <button onClick={nextQuiz} className="mt-3 w-full px-4 py-3 bg-rw-ink text-rw-paper rounded-2xl font-black">
                  {qIdx + 1 >= quiz.length ? "結果を見る" : "つぎへ"}
                </button>
              </>
            )}
          </>
        )}

        {phase === "result" &&
          (() => {
            const j = judgePlacement(items);
            return (
              <>
                <h2 className="text-xl font-black text-rw-ink tracking-tight mb-1">判定の結果</h2>
                <p className="text-[13px] text-rw-ink-soft mb-3">
                  {stage.id}. {stage.title}：{j.correct} / {j.total} 問 正解
                </p>

                {j.startAt ? (
                  <Link
                    to={`/read/grammar/${j.startAt}`}
                    className="block bg-rw-ink text-rw-paper rounded-2xl p-4 no-underline mb-3"
                    style={{ textDecoration: "none", boxShadow: "0 4px 0 var(--rw-primary)" }}
                  >
                    <div className="text-[11px] font-black opacity-80">ここから始めよう</div>
                    <div className="text-lg font-black">{titleOf(j.startAt)} ▸</div>
                  </Link>
                ) : (
                  <div className="bg-rw-paper border-2 border-rw-accent rounded-2xl p-4 mb-3">
                    <div className="font-black text-rw-accent">この段は全問正解。次の段で確かめよう。</div>
                    {nextStage && (
                      <button
                        onClick={() => goStage(nextStage.id)}
                        className="mt-3 w-full px-4 py-3 bg-rw-ink text-rw-paper rounded-2xl font-black"
                      >
                        次へ：{nextStage.id}. {nextStage.title} ▸
                      </button>
                    )}
                  </div>
                )}

                {j.shaky && prevStage && (
                  <div className="bg-rw-primary-soft/40 border border-rw-primary rounded-2xl p-3 mb-3">
                    <p className="text-[13px] text-rw-ink leading-relaxed">
                      正解が半分に届かなかったよ。1つ前の段から確かめると、ずっと楽になるかもしれない。
                    </p>
                    <button onClick={() => goStage(prevStage.id)} className="mt-2 text-[13px] font-black text-rw-primary underline">
                      {prevStage.id}. {prevStage.title} を確かめる
                    </button>
                  </div>
                )}

                <div className="text-xs font-bold text-rw-ink-soft mb-2">単元ごとの結果</div>
                <div className="space-y-1.5">
                  {items.map((it) => (
                    <Link
                      key={it.id}
                      to={`/read/grammar/${it.id}`}
                      className="flex items-center gap-3 bg-rw-paper border border-rw-rule rounded-xl px-3 py-2 no-underline text-rw-ink"
                      style={{ textDecoration: "none" }}
                    >
                      <span className={`font-black ${it.correct ? "text-rw-accent" : "text-rw-primary"}`}>
                        {it.correct ? "◯" : "×"}
                      </span>
                      <span className="flex-1 text-[14px] font-bold">{titleOf(it.id)}</span>
                      <span className="text-rw-ink-soft text-sm">→</span>
                    </Link>
                  ))}
                  {quiz.slice(items.length).map((d) => (
                    <div
                      key={d.topicId}
                      className="flex items-center gap-3 bg-rw-paper border border-dashed border-rw-rule rounded-xl px-3 py-2 text-rw-ink-soft"
                    >
                      <span className="font-black">－</span>
                      <span className="flex-1 text-[14px] font-bold">{titleOf(d.topicId)}</span>
                      <span className="text-[11px] font-bold">まだ確かめていない</span>
                    </div>
                  ))}
                </div>

                {items.length < quiz.length && (
                  <div className="mt-3">
                    <p className="text-[12px] text-rw-ink-soft leading-relaxed mb-2">
                      ×が2つ出たので、ここで止めたよ。まずは「ここから始めよう」の単元を学んでから戻ってくるのがおすすめ。
                    </p>
                    <button
                      onClick={() => {
                        setNoStop(true);
                        setQIdx(items.length);
                        setSelected(null);
                        setPhase("quiz");
                        window.scrollTo(0, 0);
                      }}
                      className="w-full px-4 py-2.5 border-2 border-rw-ink rounded-2xl text-[14px] font-black text-rw-ink"
                    >
                      残り {quiz.length - items.length} 単元も続けて確かめる
                    </button>
                  </div>
                )}

                <button onClick={() => setPhase("choose")} className="mt-4 text-[13px] font-black text-rw-ink-soft underline">
                  段を選び直す
                </button>
              </>
            );
          })()}
      </div>
    </div>
  );
}
