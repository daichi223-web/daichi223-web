import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import bundledKobunQ from '@/data/kobunQ.v2.slim.json';
import whyJson from '@/data/vocab-why.json';

// 単語理解カード（B型：核から意味を見ていく／案1「なぜ」ラベル帯）。
// 「問う前に読んで理解する場所」。答え合わせ後のパネル(WordInsightPanel)とは別に、
// 語の意味が核からどう分かれるか＝なぜその意味になるかを、ひとつずつ示す。
//
// データ源：
//   kobunQ v2 (slim) … lemma/sense/senseCore/decider/trap/examples（語・qid 不変）
//   vocab-why.json    … 核→各意味の「なぜ」（手検証・照合済みの語のみ。捏造禁止）

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
  return (tr || '').replace(/^\s*（訳）\s*/, '').trim();
}

export default function VocabCard() {
  const { lemma: rawLemma } = useParams();
  const lemma = decodeURIComponent(rawLemma || '');

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
    }
  }, [lemma, senses.length]);

  const why = WHY[lemma];
  const core = senses.find((s) => s.senseCore)?.senseCore;
  const trap = senses.find((s) => s.trap)?.trap;
  const hasTrap = !!trap;
  const total = senses.length + (hasTrap ? 1 : 0);

  // step: 0 = 核のみ / 1..senses.length = 意味を順に開示 / +1 = 現代語の罠まで
  const [step, setStep] = useState(0);
  // 理由は既定で畳んでおき、タップで開く（意味を見て一拍考えてから理由へ）
  const [openReasons, setOpenReasons] = useState<Set<string>>(new Set());
  const toggleReason = (qid: string) =>
    setOpenReasons((prev) => {
      const next = new Set(prev);
      next.has(qid) ? next.delete(qid) : next.add(qid);
      return next;
    });

  if (senses.length === 0) {
    return (
      <div className="min-h-dvh bg-rw-bg">
        <div className="max-w-2xl mx-auto px-5 py-8">
          <Link to="/vocab" className="text-sm font-semibold text-rw-ink-soft">← 単語</Link>
          <p className="mt-6 text-rw-ink font-bold">「{lemma}」は見つかりませんでした。</p>
        </div>
      </div>
    );
  }

  const shownSenses = senses.slice(0, step);
  const showTrap = hasTrap && step >= senses.length + 1;

  const counter =
    step === 0
      ? '語源のみ'
      : step <= senses.length
        ? why?.senses?.[senses[step - 1].qid]?.from || `意味 ${step} / ${senses.length}`
        : '現代語の派生まで';

  const btnLabel =
    step === 0
      ? '核から意味を見ていく ▶'
      : step < senses.length
        ? '次の意味へ ▶'
        : '現代語はどこから ▶';

  return (
    <div className="min-h-dvh bg-rw-bg">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <header className="mb-4">
          <Link to="/vocab" className="text-sm font-semibold text-rw-ink-soft hover:text-rw-ink transition-colors">
            ← 単語
          </Link>
        </header>

        <div className="bg-rw-paper border-2 border-rw-ink rounded-2xl p-5">
          {/* 見出し */}
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-black tracking-wide text-rw-ink">{lemma}</span>
            {senses[0]?.decider && (
              <span className="text-[12px] font-bold text-rw-ink-soft">— その意味になる理由を見る</span>
            )}
          </div>

          {/* 核イメージ */}
          {core && (
            <div
              className="mt-3 rounded-xl px-4 py-3 text-[15px] leading-relaxed text-rw-ink"
              style={{ background: 'color-mix(in srgb, var(--rw-accent) 12%, transparent)' }}
            >
              🧭 <span className="font-black">核イメージ</span>　{core}
              {why?.axis && (
                <div className="mt-1.5 text-[13px] text-rw-ink-soft font-semibold">{why.axis}</div>
              )}
            </div>
          )}

          {/* 意味たち（順に開示） */}
          <div className="mt-1">
            {shownSenses.map((s) => {
              const w = why?.senses?.[s.qid];
              const label = s.senseNorm || stripBrackets(s.sense);
              const ex = s.examples?.[0];
              const whyText = w?.why || s.decider?.rule;
              return (
                <div
                  key={s.qid}
                  className="pl-4 py-3 ml-2"
                  style={{ borderLeft: '2px solid var(--rw-rule)' }}
                >
                  <div className="text-[17px] font-bold text-rw-ink">
                    {label}
                    {w?.from && (
                      <span className="ml-2 text-[12.5px] font-semibold text-rw-ink-soft">{w.from}</span>
                    )}
                  </div>
                  {ex && (
                    <div className="mt-1.5 text-[14px] leading-relaxed text-rw-ink">
                      {cleanJp(ex.jp, ex.source)}
                      {ex.source && (
                        <span className="ml-1 text-[12px] text-rw-ink-soft">／{ex.source}</span>
                      )}
                      <span className="block text-[13px] text-rw-ink-soft mt-1">
                        {cleanTr(ex.translation)}
                      </span>
                    </div>
                  )}
                  {whyText && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggleReason(s.qid)}
                        className="text-[13px] font-black text-rw-accent"
                      >
                        {openReasons.has(s.qid) ? '理由 ▾' : '理由を見る ▸'}
                      </button>
                      {openReasons.has(s.qid) && (
                        <div
                          className="mt-1.5 rounded-lg px-3 py-2 text-[14px] leading-relaxed text-rw-ink"
                          style={{ background: 'color-mix(in srgb, var(--rw-accent) 12%, transparent)' }}
                        >
                          {whyText}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 現代語の罠 */}
          {showTrap && trap && (
            <div
              className="mt-3 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed font-bold text-rw-primary"
              style={{ background: 'var(--rw-primary-soft)', borderLeft: '2px dashed var(--rw-primary)' }}
            >
              ⚠ {why?.trapWhy || `現代語「${trap.modern}」の罠 — ${trap.note}`}
            </div>
          )}

          {/* 送りボタン */}
          {step < total && (
            <>
              <button
                onClick={() => setStep((s) => s + 1)}
                className="mt-4 w-full rounded-xl py-3 text-[15px] font-black text-rw-paper"
                style={{ background: 'var(--rw-accent)' }}
              >
                {btnLabel}
              </button>
              <div className="mt-2 text-right text-[12px] font-semibold text-rw-ink-soft">{counter}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
