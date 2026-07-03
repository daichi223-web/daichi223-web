import { Word } from '../../types';
import { dataParser } from '../../utils/dataParser';

// 答え合わせ後の「学びの瞬間」パネル (kobunQ v2 の増補データを表示)。
// 単語帳の語・掲載順は不変のまま、1問の中身を濃くする:
//   🧭 核イメージ — 意味たちを1つの絵にまとめる
//   🔑 決め手     — どの語・呼応・文脈が今回の意味を決めたか
//   ⚠ 現代語の罠 — 古今異義語の混同警告
//   意味マップ    — 多義語は全意味の中での今回の位置を示す

function stripBrackets(sense: string): string {
  const m = sense.match(/〔\s*(.+?)\s*〕/);
  return m ? m[1].trim() : sense.trim();
}

/** 正解直後用の1行ストリップ (テンポを崩さない最小の学び) */
export function WordInsightStrip({ word }: { word: Word }) {
  if (!word.senseCore && !word.trap) return null;
  return (
    <div
      className="mt-3 px-3.5 py-2 rounded-xl text-[12px] leading-relaxed font-semibold text-rw-ink"
      style={{ background: 'color-mix(in srgb, var(--rw-accent) 12%, transparent)' }}
    >
      {word.senseCore && (
        <span>
          🧭 <b>{word.lemma}</b>＝{word.senseCore}
        </span>
      )}
      {word.trap && (
        <span className="block mt-0.5 text-rw-primary font-bold">
          ⚠ 現代語「{word.trap.modern}」と混同しない
        </span>
      )}
    </div>
  );
}

/** 多義語モードの答え合わせ後: 核イメージ＋意味ごとの決め手一覧 (senses を1つの絵にまとめる) */
export function PolysemyInsight({ meanings, className = '' }: { meanings: Word[]; className?: string }) {
  const core = meanings.find((m) => m.senseCore)?.senseCore;
  const rows = meanings.filter((m) => m.decider);
  const trap = meanings.find((m) => m.trap)?.trap;
  if (!core && rows.length === 0 && !trap) return null;

  return (
    <div className={`bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 text-left ${className}`}>
      <p className="text-[10px] font-black text-rw-ink-soft tracking-widest mb-2">
        意味を1つの絵にまとめる
      </p>
      {core && (
        <p className="text-[13px] leading-relaxed text-rw-ink mb-2">
          🧭 <span className="font-black">核イメージ</span>
          <span className="font-semibold">　{core}</span>
        </p>
      )}
      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((m) => (
            <div key={m.qid} className="flex items-start gap-2 text-[12px] leading-relaxed">
              <span
                className="shrink-0 font-black px-2 py-0.5 rounded-full text-[11px]"
                style={{ background: 'var(--rw-accent)', color: 'var(--rw-paper)' }}
              >
                {m.senseNorm || stripBrackets(m.sense)}
              </span>
              <span className="text-rw-ink font-semibold">🔑 {m.decider!.clue}</span>
            </div>
          ))}
        </div>
      )}
      {trap && (
        <p
          className="mt-2 text-[12px] leading-relaxed font-bold text-rw-primary rounded-lg px-2 py-1.5"
          style={{ background: 'var(--rw-primary-soft)' }}
        >
          ⚠ 現代語「{trap.modern}」の罠 — {trap.note}
        </p>
      )}
    </div>
  );
}

/** 誤答時・記述採点後用のフルパネル */
export function WordInsightPanel({ word, className = '' }: { word: Word; className?: string }) {
  const hasAny = word.senseCore || word.decider || word.trap;
  const siblings = dataParser.getWordByLemma(word.lemma)?.meanings ?? [];
  const showMap = siblings.length > 1;
  if (!hasAny && !showMap) return null;

  return (
    <div className={`bg-rw-paper border-2 border-rw-ink rounded-2xl p-4 ${className}`}>
      <p className="text-[10px] font-black text-rw-ink-soft tracking-widest mb-2">
        なぜこの意味？
      </p>

      {word.senseCore && (
        <div className="flex items-start gap-2 mb-2">
          <span className="shrink-0 text-sm" aria-hidden>🧭</span>
          <p className="text-[13px] leading-relaxed text-rw-ink">
            <span className="font-black">核イメージ</span>
            <span className="font-semibold">　{word.senseCore}</span>
          </p>
        </div>
      )}

      {word.decider && (
        <div className="flex items-start gap-2 mb-2">
          <span className="shrink-0 text-sm" aria-hidden>🔑</span>
          <div className="text-[13px] leading-relaxed text-rw-ink">
            <span className="font-black">決め手</span>
            <span className="font-semibold">　{word.decider.clue}</span>
            <span
              className="block mt-0.5 font-bold rounded-lg px-2 py-1"
              style={{ background: 'color-mix(in srgb, var(--rw-accent) 12%, transparent)' }}
            >
              → {word.decider.rule}
            </span>
          </div>
        </div>
      )}

      {word.trap && (
        <div
          className="flex items-start gap-2 mb-2 rounded-lg px-2 py-1.5"
          style={{ background: 'var(--rw-primary-soft)' }}
        >
          <span className="shrink-0 text-sm" aria-hidden>⚠</span>
          <p className="text-[12px] leading-relaxed text-rw-primary font-bold">
            現代語「{word.trap.modern}」の罠 — {word.trap.note}
          </p>
        </div>
      )}

      {showMap && (
        <div className="mt-2.5 pt-2.5 border-t border-rw-rule">
          <p className="text-[10px] font-black text-rw-ink-soft tracking-wider mb-1.5">
            「{word.lemma}」の意味マップ
          </p>
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((s) => {
              const current = s.qid === word.qid;
              return (
                <span
                  key={s.qid}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                  style={
                    current
                      ? { background: 'var(--rw-accent)', color: 'var(--rw-paper)', borderColor: 'var(--rw-accent)' }
                      : { background: 'var(--rw-bg)', color: 'var(--rw-ink-soft)', borderColor: 'var(--rw-rule)' }
                  }
                >
                  {current ? '● ' : ''}
                  {s.senseNorm || stripBrackets(s.sense)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
