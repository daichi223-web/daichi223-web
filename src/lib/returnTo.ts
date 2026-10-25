/**
 * 教材から単語クイズへ飛んだとき、クイズのあとで教材に戻るための「戻り先」（2026-10-25）。
 * - 教材画面（/read/texts/…）の中の、押した語の位置（#t=トークンID）まで付けて渡す
 * - 受け取る側は教材画面のパスだけを受け付ける（外のサイトや別画面へは飛ばさない）
 */

/** クイズの URL に付ける戻り先（今の教材画面のパス＋検索＋押した語） */
export function makeReturnTo(pathname: string, search: string, tokenId?: string): string {
  return `${pathname}${search}${tokenId ? `#t=${encodeURIComponent(tokenId)}` : ""}`;
}

/** クイズの URL（単語の qid と戻り先） */
export function quizUrlWithReturn(qids: string[], returnTo: string | null): string {
  const q = `qid=${encodeURIComponent(qids.join(","))}`;
  return returnTo ? `/?${q}&back=${encodeURIComponent(returnTo)}` : `/?${q}`;
}

/** 受け取った戻り先が教材画面のパスなら返す。それ以外（外のURL・別の画面・壊れた値）は null */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/read/texts/")) return null;
  if (raw.startsWith("//") || /[\\\s]/.test(raw)) return null;
  return raw;
}

/** 教材画面の hash（#t=トークンID）から戻り先の語を取り出す */
export function tokenIdFromHash(hash: string): string | null {
  const m = /^#t=([^&]+)$/.exec(hash);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}
