import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GrammarDrill, GrammarTopic } from "@/lib/kobun/types";
import {
  buildLessonPlan,
  buildScriptPlan,
  quoteName,
  type LessonScript,
  skipSteps,
  type MenuKind,
  termOptionAnswerLines,
  termOptionNames,
  termOptions,
  type TermOption,
  type LessonPiece,
  type LessonSection,
  type SectionStep,
} from "@/lib/kobun/dojoLesson";
import { drillFeedbackWord, drillThread, isDrillAnswerCorrect } from "@/lib/kobun/drillThread";
import { markLessonDone } from "@/lib/kobun/dojoLocal";
import { logEvent, markQuestionShown } from "@/lib/learningEvents";
import { TEACHERS, TEACHER_VOICE_ENABLED, teacherImage } from "@/lib/teachers";
import { lessonLine, type LessonLines, type LessonVars } from "@/lib/teacherLessonLines";
import { useChatTeacher } from "@/lib/chatTeacher";
import { usePortraitTone } from "@/lib/portraitTone";
import { readMyStage } from "@/lib/myStage";
import { shuffle } from "@/lib/shuffle";
import { ChatRow, CHAT_AVATAR_PX, type ChatRowTone } from "@/components/quiz/ChatRow";
import { ChatFeedback } from "@/components/quiz/ChatFeedback";
import { FaceAvatar } from "@/components/noble/FaceAvatar";
import { InlineMarkdown, MarkdownContent, MarkdownTable } from "./MarkdownContent";
import { DanChart } from "./DanChart";
import { renderDrillContext } from "./drillContext";

/**
 * 文法道場の「先生と学ぶ」レッスン（2026-11-15。材料 = lib/kobun/dojoLesson.ts、設計 = docs/grammar-dojo-lesson.md）。
 * 単語クイズの先生（答えに反応する）とちがい、ここでは先生が説明を進める。
 *  - はじめに「この単元で使う言葉、意味は分かる？」（分かる／「接続」って？）
 *  - 節の中：解説を小さなかたまりで1つずつ（「つぎ ▸」）。表や「接続：○○形」を見せた直後に、今のところを1問。
 *    節の最後に、その節のドリルの問い（1〜2問）。
 *  - 節が終わったら「次はどこを説明しようか？」（残りの節から選ぶ／分かっている節は問題だけ／用語の意味を聞く）。
 *  - 全部終わったらポイントでまとめ、ドリル（記録に反映）で仕上げる。
 * 答えは logEvent にだけ記録する（ctx.mode 'lesson'）。説明の直後に解く問いなので、復習（SRS）・到達度には入れない。
 */

type Ev =
  | { t: "start" }
  // rec＝勧めている節（next・other・next から入った terms）。from＝terms に入る前の問い
  | { t: "menu"; at: MenuKind; rec?: number; from?: "start" | "next"; again?: boolean; picked?: string }
  | { t: "term"; opt: TermOption }
  | { t: "sec"; sec: number; mode: "explain" | "skip"; how: "first" | "chosen" | "last" | "final"; shown: number }
  | { t: "wrap" };

const CHIP = "text-[13px] font-black px-3 py-1.5 rounded-full border-2 border-rw-primary bg-rw-paper text-rw-ink transition hover:-translate-y-0.5";
const CHIP_MAIN = "text-[13px] font-black px-3 py-1.5 rounded-full border-2 border-rw-primary bg-rw-primary text-rw-paper transition hover:-translate-y-0.5";

export function LessonSession({
  topic,
  drills,
  script,
  onFinish,
}: {
  topic: GrammarTopic;
  drills: GrammarDrill[];
  /** 先生の台本（public/grammar-lessons/<id>.json）。無ければ解説の節から組む */
  script?: LessonScript | null;
  /** まとめのボタン：drill＝ドリルで仕上げる、page＝単元のページへ戻る */
  onFinish: (to: "drill" | "page") => void;
}) {
  // 材料と選択肢の並びは、レッスンを開いたときに1回だけ決める
  const [plan] = useState(() => (script ? buildScriptPlan(topic, script, drills) : buildLessonPlan(topic, drills)));
  const secOf = (i: number): LessonSection => (i < 0 ? plan.finalCheck! : plan.sections[i]);
  const stepsOf = (ev: Extract<Ev, { t: "sec" }>): SectionStep[] => (ev.mode === "skip" ? skipSteps(secOf(ev.sec)) : secOf(ev.sec).steps);
  const [choiceOrder] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    [...plan.sections, ...(plan.finalCheck ? [plan.finalCheck] : [])].forEach((sec) =>
      sec.steps.forEach((st, k) => {
        if (st.kind === "quick") m[`${sec.index}:${k}`] = shuffle(st.q.choices);
        if (st.kind === "ask") m[`${sec.index}:${k}`] = shuffle(st.drill.choices ?? []);
      }),
    );
    return m;
  });
  // 用語：はじめに聞くのは最初の節に出てくる言葉
  // はじめに出す用語：単元の説明ぜんぶに出てくる、先に要る言葉（単元そのものが教える言葉は外してある）
  const startTerms = plan.startTerms;
  const [events, setEvents] = useState<Ev[]>(() =>
    startTerms.length ? [{ t: "start" }, { t: "menu", at: "start" }] : [{ t: "start" }, { t: "sec", sec: 0, mode: "explain", how: "first", shown: 1 }],
  );
  const [answers, setAnswers] = useState<Record<string, string>>({}); // キー = `${節の番号}:${その節の steps の位置}`
  const [asked, setAsked] = useState<string[]>([]); // 「〜って？」と聞いた用語
  const bottomRef = useRef<HTMLDivElement>(null);

  const [teacherId] = useChatTeacher();
  const [tone] = usePortraitTone();
  const myStage = useMemo(readMyStage, []);
  const teacher = TEACHERS[teacherId];
  const teacherSrc = teacherImage(teacherId, tone);
  // 説明の前後の一言は、選んだ先生の文法の台詞（2026-11-16。説明そのものは全員共通）
  const L = (key: keyof LessonLines, seed: string, vars: LessonVars = {}) => lessonLine(key, vars, `${topic.id}:${seed}`, teacherId, TEACHER_VOICE_ENABLED);
  const startOpts = termOptions(startTerms);
  const startLines = [
    L("start", "start", { 単元: quoteName(topic.title) }),
    ...(startOpts.length
      ? [
          L("termsIntro", "start", {
            用語: termOptionNames(startOpts),
          }),
          L("termsAsk", "start"),
        ]
      : []),
  ];

  const last = events[events.length - 1];
  const doneSecs = new Set(events.flatMap((e) => (e.t === "sec" && e !== last ? [e.sec] : [])));
  const remaining = plan.sections.filter((s) => !doneSecs.has(s.index) && !(last.t === "sec" && last.sec === s.index));

  // 正解の数（答えた問いぜんぶ）
  const tally = (() => {
    let n = 0;
    let ok = 0;
    for (const e of events) {
      if (e.t !== "sec") continue;
      const sec = secOf(e.sec);
      stepsOf(e).forEach((st) => {
        const k = sec.steps.indexOf(st);
        const a = answers[`${sec.index}:${k}`];
        if (a === undefined || st.kind === "piece") return;
        n++;
        if (st.kind === "quick" ? a === st.q.answer : isDrillAnswerCorrect(st.drill, a)) ok++;
      });
    }
    return { n, ok };
  })();

  useEffect(() => {
    logEvent({ area: "grammar", action: "view", targetType: "lesson", targetId: topic.id, ctx: { step: "start", sections: plan.sections.length } });
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // まとめに着いたら、終えた印と記録
  useEffect(() => {
    if (last.t !== "wrap") return;
    markLessonDone(topic.id);
    logEvent({ area: "grammar", action: "view", targetType: "lesson", targetId: topic.id, ctx: { step: "done", correct: tally.ok, answered: tally.n } });
    // まとめに着いたときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last.t]);

  // 新しく出たものが見えるところまで送る
  useEffect(() => {
    const id = window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    return () => window.cancelAnimationFrame(id);
  }, [events, answers]);

  // 今の節で、最後に見えている問いにまだ答えていないか
  const curSec = last.t === "sec" ? last : null;
  const curSteps = curSec ? stepsOf(curSec) : [];
  const keyOf = (secIdx: number, st: SectionStep) => `${secIdx}:${secOf(secIdx).steps.indexOf(st)}`;
  const lastVisible = curSec ? curSteps[curSec.shown - 1] : undefined;
  const waiting = !!curSec && !!lastVisible && lastVisible.kind !== "piece" && answers[keyOf(curSec.sec, lastVisible)] === undefined;
  useEffect(() => {
    if (waiting) markQuestionShown();
  }, [waiting, curSec?.shown]);

  const push = (...evs: Ev[]) => setEvents((es) => [...es, ...evs]);
  const setShown = (n: number) => setEvents((es) => es.map((e, i) => (i === es.length - 1 && e.t === "sec" ? { ...e, shown: n } : e)));
  const pick = (label: string, ...next: Ev[]) =>
    setEvents((es) => [...es.map((e, i) => (i === es.length - 1 && e.t === "menu" ? { ...e, picked: label } : e)), ...next]);

  /** 節が終わったあと：残りが2つ以上なら聞く、1つなら最後の節、無ければ最後の確かめかまとめ */
  const afterSection = () => {
    const rest = remaining;
    if (rest.length >= 2) push({ t: "menu", at: "next", rec: rest[0].index });
    else if (rest.length === 1) push({ t: "sec", sec: rest[0].index, mode: "explain", how: "last", shown: 1 });
    else if (plan.finalCheck && !events.some((e) => e.t === "sec" && e.sec === -1)) push({ t: "sec", sec: -1, mode: "explain", how: "final", shown: 1 });
    else push({ t: "wrap" });
  };

  const openSection = (sec: LessonSection, mode: "explain" | "skip", label: string, how: "first" | "chosen") => {
    logEvent({ area: "grammar", action: "open", targetType: "lesson-section", targetId: `${topic.id}:${sec.heading}`, ctx: { mode, recommended: sec === remaining[0] } });
    pick(label, { t: "sec", sec: sec.index, mode, how, shown: 1 });
  };

  const askTerm = (opt: TermOption, from: "start" | "next", rec?: number) => {
    setAsked((a) => [...a, opt.key]);
    logEvent({ area: "grammar", action: "open", targetType: "gloss", targetId: opt.entries.map((e) => e.term).join("・"), ctx: { mode: "lesson", topic: topic.id } });
    pick(opt.label, { t: "term", opt }, { t: "menu", at: "terms", from, rec, again: true });
  };

  const answer = (secIdx: number, st: SectionStep, choice: string) => {
    const key = keyOf(secIdx, st);
    if (answers[key] !== undefined) return;
    setAnswers((a) => ({ ...a, [key]: choice }));
    const heading = secOf(secIdx).heading;
    if (st.kind === "ask")
      logEvent({
        area: "grammar", action: "answer", targetType: "drill", targetId: st.drill.id,
        correct: isDrillAnswerCorrect(st.drill, choice), chosen: choice, format: st.drill.kind,
        ctx: { mode: "lesson", topic: topic.id, section: heading, choices: choiceOrder[key] },
      });
    else if (st.kind === "quick")
      logEvent({
        area: "grammar", action: "answer", targetType: "lesson-q", targetId: `${topic.id}:${key}`,
        correct: choice === st.q.answer, chosen: choice, format: "lesson-quick",
        ctx: { mode: "lesson", topic: topic.id, section: heading, prompt: st.q.prompt, choices: choiceOrder[key] },
      });
  };

  // ---- 吹き出し ----
  const tAvatar = (first: boolean) =>
    first ? (
      <FaceAvatar src={teacherSrc} size={CHAT_AVATAR_PX} alt={teacher.name} className="mt-4" />
    ) : (
      <span className="shrink-0" style={{ width: CHAT_AVATAR_PX }} aria-hidden />
    );
  const say = (key: string, children: ReactNode, opts: { first?: boolean; tone?: ChatRowTone } = {}) => (
    <ChatRow key={key} side="teacher" name={opts.first ? teacher.name : ""} tone={opts.tone ?? "plain"} avatar={tAvatar(!!opts.first)}>
      {children}
    </ChatRow>
  );
  const me = (key: string, text: string) => (
    <ChatRow
      key={key}
      side="me"
      name={`${myStage.rank} ・ あなた`}
      avatar={<FaceAvatar stageN={myStage.n} tone={tone} size={CHAT_AVATAR_PX} alt={`あなた（${myStage.rank}）`} className="mt-4" />}
    >
      {text}
    </ChatRow>
  );

  const piece = (key: string, p: LessonPiece) => {
    switch (p.type) {
      case "table":
        return (
          <div key={key} className="rounded-2xl border-2 border-rw-ink bg-rw-paper p-3" style={{ marginLeft: CHAT_AVATAR_PX + 8 }}>
            {p.caption && <p className="text-[12px] font-black text-rw-ink-soft mb-1">{p.caption}</p>}
            <MarkdownTable lines={p.lines} />
          </div>
        );
      case "pre":
        return (
          <pre key={key} className="rounded-2xl border border-rw-rule bg-rw-paper p-3 text-[12px] leading-relaxed text-rw-ink overflow-x-auto whitespace-pre" style={{ marginLeft: CHAT_AVATAR_PX + 8 }}>
            {p.lines.join("\n")}
          </pre>
        );
      case "ref":
        return (
          <details key={key} className="rounded-2xl border-2 border-rw-rule bg-rw-paper p-3" style={{ marginLeft: CHAT_AVATAR_PX + 8 }}>
            <summary className="cursor-pointer text-[13px] font-black text-rw-ink-soft">📖 解説を見る：{p.text}</summary>
            <div className="mt-2">
              <MarkdownContent content={p.content} />
            </div>
          </details>
        );
      case "dan":
        return (
          <div key={key} className="rounded-2xl border-2 border-rw-ink bg-rw-paper p-3" style={{ marginLeft: CHAT_AVATAR_PX + 8 }}>
            <DanChart names={p.names} />
          </div>
        );
      case "heading":
        return say(key, <span className="font-black"><InlineMarkdown text={p.text} /></span>, { tone: "core" });
      case "item":
        return say(key, <><span className="text-rw-ink-soft">{/^\d+\./.test(p.text) ? "" : "・"}</span><InlineMarkdown text={p.text} /></>);
      case "example":
        return say(key, <span className="font-serif"><InlineMarkdown text={p.text} /></span>);
      default:
        return say(key, <InlineMarkdown text={p.text} />);
    }
  };

  /** 選択肢のボタン（答えたら正解を緑・自分の×を赤） */
  const choiceButtons = (key: string, choices: string[], isRight: (c: string) => boolean, onPick: (c: string) => void, active: boolean) => {
    const chosen = answers[key];
    const answered = chosen !== undefined;
    return (
      <div className="grid grid-cols-1 gap-1.5">
        {choices.map((c) => {
          let cls = "bg-rw-paper border-rw-rule text-rw-ink hover:border-rw-accent";
          if (answered) {
            if (isRight(c)) cls = "bg-rw-accent border-rw-accent text-rw-paper";
            else if (chosen === c) cls = "bg-rw-primary border-rw-primary text-rw-paper";
            else cls = "bg-rw-paper border-rw-rule text-rw-ink-soft opacity-60";
          }
          return (
            <button key={c} onClick={() => active && onPick(c)} disabled={answered || !active} className={`text-left font-bold py-2.5 px-3.5 rounded-xl border-2 transition text-sm leading-snug ${cls}`}>
              {c}
            </button>
          );
        })}
      </div>
    );
  };

  const renderStep = (ev: Extract<Ev, { t: "sec" }>, st: SectionStep, j: number, active: boolean) => {
    const key = keyOf(ev.sec, st);
    const k = `${ev.sec}-${j}`;
    if (st.kind === "piece") return piece(k, st.piece);
    const chosen = answers[key];
    if (st.kind === "quick") {
      const ok = chosen === st.q.answer;
      return (
        <div key={k} className="space-y-2">
          {say(`${k}-lead`, L("quickLead", k), { first: true })}
          <div className="bg-rw-paper p-3 rounded-2xl border-2 border-rw-ink">
            {st.q.context && (
              <>
                <p className="text-rw-ink font-serif text-[15px] leading-relaxed">{renderDrillContext(st.q.context, chosen !== undefined)}</p>
                <div className="border-b border-rw-rule my-2" />
              </>
            )}
            <p className="text-[15px] font-black text-rw-ink leading-snug">{st.q.prompt}</p>
          </div>
          {choiceButtons(key, choiceOrder[key] ?? st.q.choices, (c) => c === st.q.answer, (c) => answer(ev.sec, st, c), active)}
          {chosen !== undefined && (
            <div className="space-y-1.5">
              {me(`${k}-me`, chosen)}
              {say(`${k}-v`, <span className={ok ? "text-rw-accent font-black" : "text-rw-primary font-black"}>{ok ? `◯ ${L("right", k)}` : `× ${L("wrong", k, { 正解: st.q.answer })}`}</span>, { first: true })}
              {!ok && st.q.miss?.[chosen] && say(`${k}-m`, <InlineMarkdown text={st.q.miss[chosen]} />)}
              {say(`${k}-e`, <InlineMarkdown text={st.q.explain} />)}
            </div>
          )}
        </div>
      );
    }
    return (
      <div key={k} className="space-y-2">
        {say(`${k}-lead`, st.nth === 0 ? L("askLead", k) : L("askMore", k), { first: true })}
        <div className="bg-rw-paper p-3.5 rounded-2xl border-2 border-rw-ink">
          {st.drill.context && (
            <>
              <p className="text-rw-ink font-serif text-[15px] leading-relaxed">{renderDrillContext(st.drill.context, chosen !== undefined)}</p>
              <div className="border-b border-rw-rule my-2" />
            </>
          )}
          <p className="text-[15px] font-black text-rw-ink leading-snug">{st.drill.prompt}</p>
        </div>
        {choiceButtons(key, choiceOrder[key] ?? [], (c) => isDrillAnswerCorrect(st.drill, c), (c) => answer(ev.sec, st, c), active)}
        {chosen !== undefined && (
          <ChatFeedback
            bubbles={drillThread(st.drill, chosen, { teacher: teacherId, voice: TEACHER_VOICE_ENABLED })}
            canAdvance={false}
            onNext={() => {}}
            teacher={teacher}
            teacherSrc={teacherSrc}
            teacherSrcFor={(e) => teacherImage(teacherId, tone, e)}
            me={{ stageN: myStage.n, tone, rankLabel: myStage.rank }}
            word={drillFeedbackWord(st.drill)}
          />
        )}
      </div>
    );
  };

  const renderEv = (ev: Ev, i: number) => {
    const isLast = i === events.length - 1;
    if (ev.t === "start")
      return (
        <section key={i} className="space-y-1.5">
          {startLines.map((l, k) => say(`${i}-${k}`, l, { first: k === 0 }))}
        </section>
      );
    if (ev.t === "term")
      return (
        <section key={i} className="space-y-1.5">
          {(ev.opt.entries.length === 1 ? [L("termLead", `term:${ev.opt.key}`, { 用語: `「${ev.opt.entries[0].term}」` }), ...termOptionAnswerLines(ev.opt).slice(1)] : termOptionAnswerLines(ev.opt)).map((l, k) => say(`${i}-${k}`, k === 0 ? <span className="font-black">{l}</span> : l, { first: k === 0, tone: k === 0 ? "core" : "plain" }))}
        </section>
      );
    if (ev.t === "menu") {
      // 1つの問いには同じ水準の選択肢だけ（2026-11-15 ユーザー指摘「質問がMECEではない。抽象度が揃ってない」）
      const recSec = ev.rec !== undefined ? plan.sections[ev.rec] : remaining[0];
      const termPool = ev.from === "next" ? recSec?.terms ?? [] : startTerms;
      const termsLeft = termOptions(termPool).filter((o) => !asked.includes(o.key));
      const lines: string[] =
        ev.at === "start"
          ? []
          : ev.at === "terms"
            ? [ev.again ? L("moreTerms", `m${i}`) : L("whichTerm", `m${i}`)]
            : ev.at === "next"
              ? [L("nextPart", `m${i}`, { 部分: quoteName(recSec?.heading ?? "") }), L("nextAsk", `m${i}`)]
              : [L("otherAsk", `m${i}`)];
      const opts: { label: string; main?: boolean; go: () => void }[] = [];
      if (ev.at === "start" && recSec) {
        opts.push({ label: "分かる、はじめよう", main: true, go: () => openSection(recSec, "explain", "分かる、はじめよう", "first") });
        if (termsLeft.length) opts.push({ label: "分からない言葉がある", go: () => pick("分からない言葉がある", { t: "menu", at: "terms", from: "start" }) });
      }
      if (ev.at === "terms") {
        termsLeft.forEach((o) => opts.push({ label: o.label, go: () => askTerm(o, ev.from ?? "start", ev.rec) }));
        if (ev.from === "next" && recSec)
          opts.push({ label: "もう大丈夫", main: true, go: () => pick("もう大丈夫", { t: "menu", at: "next", rec: recSec.index }) });
        else if (plan.sections[0])
          opts.push({ label: "もう大丈夫、はじめよう", main: true, go: () => openSection(plan.sections[0], "explain", "もう大丈夫、はじめよう", "first") });
      }
      if (ev.at === "next" && recSec) {
        // 台本の部分は「〜を教えて」「〜は分かってる」（台本の ask・known）
        const askLabel = recSec.ask ?? "説明して";
        const knownLabel = recSec.known ? `${recSec.known} → 問題だけ` : "分かってる → 問題だけ";
        opts.push({ label: askLabel, main: true, go: () => openSection(recSec, "explain", askLabel, "chosen") });
        if (skipSteps(recSec).length) opts.push({ label: knownLabel, go: () => openSection(recSec, "skip", recSec.known ? `${recSec.known}。問題だけ` : "分かってる。問題だけ", "chosen") });
        if (remaining.length >= 2) opts.push({ label: "ほかの所がいい", go: () => pick("ほかの所がいい", { t: "menu", at: "other", rec: recSec.index }) });
        if (termsLeft.length) opts.push({ label: "分からない言葉がある", go: () => pick("分からない言葉がある", { t: "menu", at: "terms", from: "next", rec: recSec.index }) });
      }
      if (ev.at === "other" && recSec) {
        remaining.filter((x) => x.index !== recSec.index).forEach((x) => opts.push({ label: quoteName(x.heading), go: () => openSection(x, "explain", quoteName(x.heading), "chosen") }));
        opts.push({ label: `やっぱり${quoteName(recSec.heading)}`, main: true, go: () => openSection(recSec, "explain", `やっぱり${quoteName(recSec.heading)}`, "chosen") });
      }
      return (
        <section key={i} className="space-y-1.5">
          {lines.map((l, k) => say(`${i}-q${k}`, l, { first: k === 0 }))}
          {ev.picked
            ? me(`${i}-me`, ev.picked)
            : isLast && (
                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  {opts.map((o) => (
                    <button key={o.label} className={o.main ? CHIP_MAIN : CHIP} onClick={o.go}>
                      {o.label}
                      {o.main && " ▸"}
                    </button>
                  ))}
                </div>
              )}
          {ev.at === "next" && !ev.picked && isLast && (
            <div className="text-right">
              <button className="text-[12px] font-bold text-rw-ink-soft underline" onClick={() => pick("ここまででまとめて", { t: "wrap" })}>
                ここまででまとめへ
              </button>
            </div>
          )}
        </section>
      );
    }
    if (ev.t === "sec") {
      const sec = secOf(ev.sec);
      const steps = stepsOf(ev);
      const part = { 部分: quoteName(sec.heading) };
      const intro =
        ev.how === "final"
          ? L("finalCheck", `s${i}`)
          : ev.mode === "skip"
            ? L("knownReply", `s${i}`, part)
            : L(ev.how === "last" ? "partLast" : ev.how === "first" ? "partFirst" : "partChosen", `s${i}`, part);
      return (
        <section key={i} className="space-y-2" aria-label={sec.heading || "確かめ"}>
          {say(`${i}-intro`, <span className="font-black">{intro}</span>, { first: true, tone: "core" })}
          {steps.slice(0, ev.shown).map((st, j) => renderStep(ev, st, j, isLast))}
        </section>
      );
    }
    // まとめ
    return (
      <section key={i} className="space-y-1.5" aria-label="まとめ">
        {[plan.keyPoints.length ? L("wrapLead", "wrap") : L("wrapPraise", "wrap"), ...plan.keyPoints, L("finish", "wrap")].map((line, k) =>
          say(`${i}-${k}`, k === 0 ? <span className="font-black">{line}</span> : line, { first: k === 0, tone: k > 0 && k <= plan.keyPoints.length ? "core" : "plain" }),
        )}
        {tally.n > 0 && <p className="text-center text-[12px] font-black text-rw-ink-soft pt-2">途中の問い {tally.ok} / {tally.n} 問 正解</p>}
        <div className="pt-3 space-y-2.5">
          <button onClick={() => onFinish("drill")} className="block w-full text-center bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-3.5 tracking-wider" style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}>
            ⚔️ ドリルで仕上げる（記録に反映）
          </button>
          <button onClick={() => onFinish("page")} className="block w-full text-center bg-rw-paper border-2 border-rw-ink text-rw-ink font-black rounded-2xl px-6 py-2.5">
            単元のページへ
          </button>
        </div>
      </section>
    );
  };

  // 今の節の操作：つぎのかたまり／この節をまとめて（次の問いまで）／節を終える
  const nextQuestionAt = curSec ? curSteps.findIndex((st, j) => j >= curSec.shown && st.kind !== "piece") : -1;
  const sectionDone = !!curSec && curSec.shown >= curSteps.length && !waiting;
  const done = new Set(events.flatMap((e) => (e.t === "sec" ? [e.sec] : [])));

  return (
    // px-1：吹き出しの行は枠の外へ 3px 広げてある（ChatRow）。横にはみ出さないための余白
    <div className="px-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-black text-rw-ink-soft tracking-wider">
          👩‍🏫 先生と学ぶ｜説明 {[...done].filter((x) => x >= 0).length} / {plan.sections.length}
        </span>
        {tally.n > 0 && <span className="text-[11px] font-black text-rw-ink-soft">正解 {tally.ok} / {tally.n}</span>}
      </div>

      <div className="space-y-4">{events.map(renderEv)}</div>

      {curSec && !waiting && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {!sectionDone ? (
            <>
              <button onClick={() => setShown(curSec.shown + 1)} className="w-full bg-rw-ink text-rw-paper font-black rounded-2xl px-6 py-3 tracking-wider">
                つぎ ▸
              </button>
              {curSec.mode === "explain" && curSteps[curSec.shown]?.kind === "piece" && (
                <button
                  onClick={() => setShown(nextQuestionAt < 0 ? curSteps.length : nextQuestionAt + 1)}
                  className="text-[12px] font-bold text-rw-ink-soft underline"
                >
                  {nextQuestionAt < 0 ? "この節をまとめて見る" : "次の問いまでまとめて見る"}
                </button>
              )}
            </>
          ) : (
            <button onClick={afterSection} className="w-full bg-rw-primary text-rw-paper font-black rounded-2xl px-6 py-3 tracking-wider" style={{ boxShadow: "0 4px 0 var(--rw-ink)" }}>
              {remaining.length === 0 && (curSec.sec === -1 || !plan.finalCheck) ? "まとめへ ▸" : "わかった ▸"}
            </button>
          )}
        </div>
      )}
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}

export default LessonSession;
