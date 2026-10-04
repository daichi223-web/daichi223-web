/**
 * 記述の判定を画面から使うための薄い層。
 * - 読み（かな）の辞書を裏で読み込む。済んでいなければ表記だけで判定する
 * - 判定結果を answers 表の auto 欄（既存の教員画面が読む形）に直す
 */
import { judgeWriting, type WritingJudgeResult } from './writingJudge';
import type { Word } from '../types';

let readingFn: ((s: string) => string) | null = null;
let loading: Promise<void> | null = null;

type ReadingToken = { surface_form: string | Uint8Array; reading?: string };

// ブラウザ用の入口を、記述問題が出たときだけ読み込む（既定の入口は Node 用で、ビルドに入らない）
async function buildTokenizer(): Promise<{ tokenize(text: string): ReadingToken[] }> {
  const { default: kuromoji } = await import('kuromoji.js/browser');
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: '/kuromoji/dict' }).build((err, tk) => (err ? reject(err) : resolve(tk)));
  });
}

/** 読みの辞書（約18MB・初回だけ通信）を裏で読み込む。失敗しても判定は表記だけで続く */
export function preloadReading(): Promise<void> {
  if (readingFn) return Promise.resolve();
  if (!loading) {
    loading = buildTokenizer()
      .then((tk) => {
        const cache = new Map<string, string>();
        readingFn = (s: string) => {
          let r = cache.get(s);
          if (r === undefined) {
            r = tk
              .tokenize(s)
              .map((t) => (t.reading && t.reading !== '*' ? t.reading : String(t.surface_form)))
              .join('');
            cache.set(s, r);
          }
          return r;
        };
      })
      .catch((e) => {
        console.warn('[writingJudge] 読みの辞書を読み込めませんでした。表記だけで判定します:', e);
        loading = null;
      });
  }
  return loading;
}

/** 記述1問を判定する。siblings は同じ見出し語の全意味（target を含んでよい） */
export function judgeWritingAnswer(answer: string, target: Word, siblings: Word[]): WritingJudgeResult {
  return judgeWriting({ answer, target, siblings, toReading: readingFn ?? undefined });
}

/** 機械で正誤が確定したか（保留は false） */
export const isDecided = (r: WritingJudgeResult): boolean => r.verdict !== 'pending';

/** answers 表の auto 欄。点数は 正解=100／それ以外=0、理由に分類名を入れる */
export function toAutoFields(r: WritingJudgeResult): {
  autoScore: number;
  autoResult: 'OK' | 'NG' | 'ABSTAIN';
  autoReason: string;
} {
  const reason =
    `judge:${r.verdict}` +
    (r.matchedQid ? `:${r.matchedQid}` : '') +
    (r.partial ? ':partial' : '') +
    (r.overlap ? ':overlap' : '');
  if (r.verdict === 'correct') return { autoScore: 100, autoResult: 'OK', autoReason: reason };
  if (r.verdict === 'pending') return { autoScore: 0, autoResult: 'ABSTAIN', autoReason: reason };
  return { autoScore: 0, autoResult: 'NG', autoReason: reason };
}
