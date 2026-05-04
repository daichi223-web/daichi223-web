// 記述クイズの補助コメント担当 (Chrome 内蔵 Gemini Nano)。
// オプトイン: localStorage 'kobun:nano-coach' = '1'
// 採点 (kuromoji 側) のスコアには一切影響させない。
// API 未対応・例外時は null を返してサイレントフォールバック。

const OPTIN_KEY = 'kobun:nano-coach';

export type CoachStatus =
  | 'unsupported'    // ブラウザに API 自体無し
  | 'unavailable'    // 端末スペック不足等で使えない
  | 'downloadable'   // 利用可だがモデル DL 要
  | 'downloading'    // DL 中
  | 'available';     // 即使える

export function isCoachOptedIn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(OPTIN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCoachOptIn(v: boolean): void {
  try {
    if (v) localStorage.setItem(OPTIN_KEY, '1');
    else localStorage.removeItem(OPTIN_KEY);
  } catch {
    /* ignore */
  }
}

// 標準化版 (Chrome 138+) は LanguageModel グローバル、
// 旧版 (Chrome 127-137) は window.ai.languageModel
function getApi(): any | null {
  if (typeof window === 'undefined') return null;
  const std = (globalThis as any).LanguageModel;
  if (std) return std;
  const legacy = (window as any).ai?.languageModel;
  if (legacy) return legacy;
  return null;
}

export async function getCoachStatus(): Promise<CoachStatus> {
  const api = getApi();
  if (!api) return 'unsupported';
  try {
    if (typeof api.availability === 'function') {
      const a = await api.availability();
      if (a === 'available' || a === 'readily') return 'available';
      if (a === 'downloadable' || a === 'after-download') return 'downloadable';
      if (a === 'downloading') return 'downloading';
      return 'unavailable';
    }
    if (typeof api.capabilities === 'function') {
      const c = await api.capabilities();
      if (c?.available === 'readily') return 'available';
      if (c?.available === 'after-download') return 'downloadable';
      return 'unavailable';
    }
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

const SYSTEM_PROMPT =
  'あなたは古文の先生です。生徒の現代語訳が文脈での意味として通っているかを判定し、' +
  '冒頭に「○通っている」「△惜しい」「×ちがう」のいずれかを置き、' +
  '理由を1〜2文で簡潔に書いてください。難しい文法用語は避け、中高生にわかる言葉で。' +
  '長く書かないこと。';

let cachedSession: any | null = null;
let cachedSessionPromise: Promise<any | null> | null = null;
let progressCb: ((ratio: number) => void) | null = null;

async function getSession(): Promise<any | null> {
  if (cachedSession) return cachedSession;
  if (cachedSessionPromise) return cachedSessionPromise;
  const api = getApi();
  if (!api) return null;
  cachedSessionPromise = (async () => {
    try {
      const opts: any = {
        initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
      };
      if (progressCb) {
        opts.monitor = (m: any) => {
          m.addEventListener('downloadprogress', (e: any) => {
            const ratio =
              typeof e?.loaded === 'number'
                ? e.total
                  ? e.loaded / e.total
                  : e.loaded
                : 0;
            progressCb?.(ratio);
          });
        };
      }
      cachedSession = await api.create(opts);
      return cachedSession;
    } catch {
      cachedSession = null;
      return null;
    } finally {
      cachedSessionPromise = null;
    }
  })();
  return cachedSessionPromise;
}

export async function ensureDownloaded(
  onProgress?: (ratio: number) => void
): Promise<CoachStatus> {
  progressCb = onProgress ?? null;
  await getSession();
  progressCb = null;
  return getCoachStatus();
}

// OFF にしたときにセッションを解放してメモリを返す。
// モデル本体 (DL 済み 2GB) は保持される — 再 ON 時は即使える。
export function destroySession(): void {
  try {
    cachedSession?.destroy?.();
  } catch {
    /* ignore */
  }
  cachedSession = null;
  cachedSessionPromise = null;
}

export type CoachInput = {
  kobun: string;
  lemma: string;
  modelAnswer: string;
  userAnswer: string;
};

export async function coachWriting(
  input: CoachInput,
  signal?: AbortSignal
): Promise<string | null> {
  if (!isCoachOptedIn()) return null;
  const status = await getCoachStatus();
  if (status !== 'available') return null;
  const session = await getSession();
  if (!session) return null;
  try {
    const prompt =
      `古文: 「${input.kobun}」\n` +
      `見出し語: 「${input.lemma}」\n` +
      `模範解答: 「${input.modelAnswer}」\n` +
      `生徒の答え: 「${input.userAnswer}」`;
    const result = await session.prompt(prompt, signal ? { signal } : undefined);
    return typeof result === 'string' ? result.trim() : null;
  } catch {
    return null;
  }
}
