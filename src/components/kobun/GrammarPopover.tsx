import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Token, LayerId, TokenAnalysis, TokenDecider } from "@/lib/kobun/types";
import { ReibunSentence, DECIDER_STYLE } from "@/components/grammar/ReibunSentence";
import { buildGemUrl, buildNotebookLmUrl } from "@/lib/kobun/gem";
import { addVocabEntry, recordHintOpen } from "@/lib/kobun/progress";
import VocabModal from "@/components/VocabModal";
import { getQuizQidsForLemma } from "@/lib/vocabLookup";
import { enrichGrammarInfo } from "@/lib/kobun/auxiliaryInfo";
import { resolveVocabKey } from "@/lib/vocabAlias";

/** 文法道場にクイズがある単元（grammarRefId の解決先がこの集合にあれば挑戦ボタンを出す） */
const QUIZ_TOPICS = new Set<string>([
  "doushi-katsuyo", "doushi-yodan", "doushi-kami-ichidan", "doushi-shimo-nidan",
  "doushi-kahen", "doushi-sahen", "doushi-rahen",
  "keiyoshi-katsuyo", "keiyoshi-ku", "keiyoshi-shiku", "keiyoshi-gokan", "onbin",
  "jodoshi-jisei", "jodoshi-keri", "jodoshi-tsu", "jodoshi-nu", "jodoshi-tari", "jodoshi-ri",
  "jodoshi-mu", "jodoshi-suiryo", "jodoshi-beshi", "jodoshi-zu", "jodoshi-ru", "jodoshi-su",
  "jodoshi-ganbou", "jodoshi-dantei", "jodoshi-nari",
  "joshi-kaku", "joshi-setsuzoku", "joshi-fuku-kakari", "joshi-shujoshi", "kakari-musubi",
  "keigo", "keigo-sonkei", "keigo-kenjou", "keigo-teinei",
  "shikibetsu-ni", "shikibetsu-nu-ne", "shikibetsu-namu", "shikibetsu-ru-re",
  "shikibetsu-nari", "shikibetsu-shi", "vocab-kokon",
]);

/** 教材タグの参照単元(grammarRefId)を、ドリルがあるクイズ単元へ解決する */
function resolveQuizTopic(refId: string | undefined, meaning: string | undefined): string | null {
  if (!refId) return null;
  // ドリルの無いグループ参照を、対応する個別クイズ単元へ
  if (refId === "jodoshi-ukemi-shieki-sonkei") return meaning && meaning.includes("使役") ? "jodoshi-su" : "jodoshi-ru";
  if (refId === "jodoshi-hitei") return "jodoshi-zu";
  return refId;
}

interface GrammarPopoverProps {
  token: Token;
  currentLayer: LayerId;
  analysis: TokenAnalysis | null;
  textTitle: string;
  textId: string;
  sentenceText: string;
  onClose: () => void;
}

export function GrammarPopover({
  token,
  currentLayer,
  analysis,
  textTitle,
  textId,
  sentenceText,
  onClose,
}: GrammarPopoverProps) {
  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-grammar-popover]")) return;
      onClose();
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [onClose]);

  // 開いた瞬間にカウントを増やす (シークレット指標)
  useEffect(() => {
    if (textId && token?.text) recordHintOpen(textId, token.text);
  }, [textId, token?.text]);

  const isScaffold = token.layer > currentLayer;
  const tag = token.grammarTag;

  return (
    <>
      {/* デスクトップ: ポップオーバー */}
      <div
        data-grammar-popover
        className="hidden sm:block absolute z-20 mt-1 left-0 right-0 max-w-xs mx-auto
                   bg-rw-paper rounded-2xl shadow-lg border-2 border-rw-ink p-4
                   animate-popover-in"
      >
        <PopoverContent
          token={token}
          isScaffold={isScaffold}
          tag={tag}
          analysis={analysis}
          textTitle={textTitle}
          textId={textId}
          sentenceText={sentenceText}
          currentLayer={currentLayer}
          onClose={onClose}
        />
      </div>

      {/* モバイル: ボトムシート */}
      <div className="sm:hidden fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div
          data-grammar-popover
          className="absolute bottom-0 left-0 right-0
                     bg-rw-paper rounded-t-3xl shadow-2xl p-5 pb-8
                     animate-slide-up max-h-[75vh] overflow-y-auto border-t-2 border-rw-ink"
        >
          <div className="w-10 h-1 bg-rw-ink/20 rounded-full mx-auto mb-4" />
          <PopoverContent
            token={token}
            isScaffold={isScaffold}
            tag={tag}
            analysis={analysis}
            textTitle={textTitle}
            textId={textId}
            sentenceText={sentenceText}
            currentLayer={currentLayer}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  );
}

function PopoverContent({
  token,
  isScaffold,
  tag,
  analysis,
  textTitle,
  textId,
  sentenceText,
  currentLayer,
  onClose,
}: {
  token: Token;
  isScaffold: boolean;
  tag: Token["grammarTag"];
  analysis: TokenAnalysis | null;
  textTitle: string;
  textId: string;
  sentenceText: string;
  currentLayer: LayerId;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const gemUrl = buildGemUrl({ textTitle, sentenceText, token, currentLayer });
  const nlmUrl = buildNotebookLmUrl({ token, currentLayer });

  const [vocabLemma, setVocabLemma] = useState<string | null>(null);
  const [addedToVocab, setAddedToVocab] = useState(false);
  // 見出し語 / 表層形 / 漢字表記揺れ / 派生形の解決を vocabAlias に集約。
  const vocabCandidate = resolveVocabKey(token.text, tag.baseForm);

  // 文法クイズ（道場）への解決先。動詞/助動詞/助詞/敬語など、文法タグから挑戦できる
  const grammarQuizTopic = resolveQuizTopic(token.grammarRefId, tag.meaning ?? undefined);
  const showGrammarQuiz = !!grammarQuizTopic && QUIZ_TOPICS.has(grammarQuizTopic);

  // クイズ qid 逆引き: この語が単語クイズに出るかどうか
  const quizQids = (() => {
    const base = tag.baseForm;
    let qids = base ? getQuizQidsForLemma(base, tag.pos) : [];
    if (qids.length === 0 && tag.pos) qids = getQuizQidsForLemma(token.text, tag.pos);
    if (qids.length === 0) qids = base ? getQuizQidsForLemma(base) : getQuizQidsForLemma(token.text);
    return qids;
  })();

  function handleAddVocab() {
    addVocabEntry({
      tokenText: token.text,
      baseForm: tag.baseForm || token.text,
      pos: tag.pos,
      hint: token.hint,
      textId,
      grammarRefId: token.grammarRefId,
      viewedAt: new Date().toISOString(),
    });
    setAddedToVocab(true);
    // 1.5秒で自動リセット (再追加可能、無効化はしない)
    setTimeout(() => setAddedToVocab(false), 1500);
  }

  return (
    <div className="space-y-3 text-rw-ink">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-black">{token.text}</p>
        {tag.baseForm && tag.baseForm !== token.text && (
          <p className="text-sm text-rw-ink-soft">← {tag.baseForm}</p>
        )}
      </div>

      {(() => {
        // 助動詞・助詞の「接続」、抽象省略表記の「活用形」を補完
        const enriched = enrichGrammarInfo(
          tag.pos,
          token.text,
          tag.baseForm,
          tag.conjugationType,
          tag.conjugationForm,
          tag.meaning,
        );
        const isInflectingPos = tag.pos === '動詞' || tag.pos === '形容詞' || tag.pos === '形容動詞' || tag.pos === '助動詞';
        return (
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <span className="text-rw-ink-soft font-bold">品詞</span>
            <span>{tag.pos}</span>

            {enriched.connection && (
              <>
                <span className="text-rw-ink-soft font-bold">接続</span>
                <span>{enriched.connection}</span>
              </>
            )}

            {tag.meaning && (
              <>
                <span className="text-rw-ink-soft font-bold">意味</span>
                <span>{tag.meaning}</span>
              </>
            )}

            {token.translation && (
              <>
                <span className="text-rw-ink-soft font-bold">訳</span>
                <span>{token.translation}</span>
              </>
            )}

            {!isScaffold && isInflectingPos && (
              <>
                <span className="text-rw-ink-soft font-bold">活用型</span>
                <span>{enriched.conjugationType || <span className="text-rw-ink-soft/60">—</span>}</span>
              </>
            )}

            {!isScaffold && isInflectingPos && (
              <>
                <span className="text-rw-ink-soft font-bold">活用形</span>
                <span>{enriched.conjugationForm || <span className="text-rw-ink-soft/60">—</span>}</span>
              </>
            )}
          </div>
        );
      })()}

      {/* 重要ポイント（hint） */}
      {!isScaffold && token.hint && (
        <div className="rounded-xl px-3 py-2 border-l-4 border-rw-pop" style={{ background: 'var(--rw-pop)' + '33' }}>
          <p className="text-xs font-black text-rw-ink mb-0.5 tracking-wider">重要ポイント</p>
          <p className="text-sm text-rw-ink">{token.hint}</p>
        </div>
      )}

      {/* 意味の決め手（例文集と同じモデル：型＋手がかり＋理由） */}
      {!isScaffold && analysis?.decider && (
        <DeciderPanel decider={analysis.decider} token={token} sentenceText={sentenceText} />
      )}

      {/* 判別の筋道（分析対象のみ） */}
      {!isScaffold && analysis && analysis.reasoning && analysis.reasoning.length > 0 && (
        <div className="border-t border-rw-rule pt-3 space-y-2">
          <p className="text-xs font-black text-rw-ink-soft tracking-wider">判別の筋道</p>
          {analysis.reasoning.map((step, i) => (
            <div key={i} className="text-xs space-y-0.5">
              <p className="text-rw-primary font-bold">Q: {step.question}</p>
              <p className="text-rw-ink">A: {step.answer}</p>
              <p className="text-rw-ink-soft">{step.explanation}</p>
            </div>
          ))}
        </div>
      )}

      {/* 単語帳追加ボタン (大きめ・目立たせる) */}
      <button
        onClick={handleAddVocab}
        disabled={addedToVocab}
        className={`w-full font-black py-2.5 px-4 rounded-full transition-all border-2 ${
          addedToVocab
            ? 'bg-rw-accent text-rw-paper border-rw-accent'
            : 'bg-rw-paper text-rw-ink border-rw-ink hover:bg-rw-primary-soft active:scale-95'
        }`}
        style={addedToVocab ? undefined : { boxShadow: '0 3px 0 var(--rw-primary)' }}
      >
        {addedToVocab ? '✓ 単語帳に追加しました' : '+ 単語帳に追加'}
      </button>

      {/* 語彙解説 (vocab DB にある語のみ) */}
      {vocabCandidate && (
        <button
          onClick={() => setVocabLemma(vocabCandidate)}
          className="w-full text-left px-3 py-2 rounded-xl text-sm font-bold border-2 transition-colors"
          style={{
            background: 'color-mix(in srgb, var(--layer-5) 8%, transparent)',
            borderColor: 'color-mix(in srgb, var(--layer-5) 30%, transparent)',
            color: 'var(--layer-5)',
          }}
        >
          📖 「{vocabCandidate}」の語彙解説
        </button>
      )}

      {/* 文法クイズ起動（道場の該当単元へジャンプ） */}
      {showGrammarQuiz && (
        <button
          onClick={() => {
            onClose();
            navigate(`/read/grammar/${grammarQuizTopic}`);
          }}
          className="w-full text-left px-3 py-2 rounded-xl text-sm font-black border-2 transition-colors bg-rw-primary text-rw-paper border-rw-ink hover:opacity-90"
          style={{ boxShadow: "0 3px 0 var(--rw-ink)" }}
          title="この文法事項を文法道場のクイズで練習する"
        >
          ⚔️ この文法のクイズに挑戦 →
        </button>
      )}

      {/* クイズ起動 (単語クイズに出る語のみ) */}
      {quizQids.length > 0 && (
        <button
          onClick={() => {
            onClose();
            navigate(`/?qid=${encodeURIComponent(quizQids.join(','))}`);
          }}
          className="w-full text-left px-3 py-2 rounded-xl text-sm font-bold border-2 transition-colors"
          style={{
            background: 'color-mix(in srgb, var(--rw-pop) 25%, transparent)',
            borderColor: 'var(--rw-pop)',
            color: 'var(--rw-ink)',
          }}
          title={`単語クイズで「${tag.baseForm || token.text}」を ${quizQids.length} 問だけ解く`}
        >
          🔤 「{tag.baseForm || token.text}」のクイズに挑戦
        </button>
      )}

      {/* リンク3つ横並び */}
      <div className="flex items-center justify-between text-sm border-t border-rw-rule pt-2">
        {token.grammarRefId ? (
          <button
            className="hover:underline font-bold"
            style={{ color: 'var(--layer-1)' }}
            onClick={() => {
              onClose();
              navigate(`/read/reference/${token.grammarRefId}`);
            }}
          >
            📘 文法解説 →
          </button>
        ) : (
          <span />
        )}
        <button
          className="text-rw-tertiary hover:underline"
          onClick={() => {
            window.open(nlmUrl, "_blank", "noopener,noreferrer");
          }}
        >
          NLM →
        </button>
        <button
          className="text-rw-primary font-bold hover:opacity-80 transition-colors"
          onClick={() => {
            window.open(gemUrl, "_blank", "noopener,noreferrer");
          }}
        >
          先生AI →
        </button>
      </div>

      {/* VocabModal — popover より前面に重ねる */}
      {vocabLemma && (
        <VocabModal lemma={vocabLemma} onClose={() => setVocabLemma(null)} textId={textId} />
      )}
    </div>
  );
}

/**
 * 意味の決め手パネル。例文集（ReibunSentence）と同じ視覚言語で、
 * 「この語がなぜその意味になるか」を 型(色) ＋ 本文中の手がかり(色つき下線) ＋ 理由文 で示す。
 */
function DeciderPanel({
  decider,
  token,
  sentenceText,
}: {
  decider: TokenDecider;
  token: Token;
  sentenceText: string;
}) {
  const style = DECIDER_STYLE[decider.type] ?? DECIDER_STYLE["文脈"];

  // 判定対象（この語）を 【】 で囲み、例文集と同じ描画に渡す（太字＋下線）。
  const s = sentenceText;
  const inRange =
    token.start >= 0 &&
    token.end <= s.length &&
    token.end > token.start &&
    s.slice(token.start, token.end) === token.text;
  const marked = inRange
    ? `${s.slice(0, token.start)}【${s.slice(token.start, token.end)}】${s.slice(token.end)}`
    : s.includes(token.text)
    ? s.replace(token.text, `【${token.text}】`)
    : s;

  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: style.color + "14", borderLeft: `4px solid ${style.color}` }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className="text-xs font-black tracking-wider" style={{ color: style.color }}>
          🔑 意味の決め手
        </span>
        <span
          className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
          style={{ background: style.color + "26", color: style.color }}
        >
          {decider.type}で決まる
        </span>
        <span className="text-[11px] font-black text-rw-ink">→「{decider.meaning}」</span>
      </div>

      {/* 例文集と同じ：本文中の手がかりを色つき下線で（タップで理由） */}
      <p className="text-[15px] text-rw-ink leading-relaxed mb-1.5 font-serif">
        <ReibunSentence text={marked} cues={decider.cues} />
      </p>

      <p className="text-[12.5px] text-rw-ink leading-relaxed">{decider.summary}</p>
      <p className="text-[10.5px] text-rw-ink-soft mt-1.5">
        ［{decider.type}］{style.desc}
      </p>
    </div>
  );
}
