/**
 * 教材から単語クイズへ飛んだとき、クイズのあとで教材に戻るための「戻り先」（2026-10-25）。
 * - 教材画面（/read/texts/…）の中の、押した語の位置（#t=トークンID）まで付けて渡す
 * - 受け取る側は教材画面のパスだけを受け付ける（外のサイトや別画面へは飛ばさない）
 * - 2026-11-06：単語カード（/word/…）からもクイズへ飛べるようにしたので、単語カードのパスも受け付ける
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

/** 単語カード（/word/<見出し語>）のパスか。見出し語の1区切りだけを通す（?back= や # は付いていてよい） */
function isWordCardPath(raw: string): boolean {
  const path = raw.split(/[?#]/)[0];
  return /^\/word\/[^/]+$/.test(path) && path !== "/word/..";
}

/**
 * 受け取った戻り先が教材画面か単語カードのパスなら返す。それ以外（外のURL・別の画面・壊れた値）は null。
 * 単語カードは 2026-11-06 に足した（単語カードの「この語をクイズで確かめる」から来たとき、カードへ戻すため）。
 * 教材のパスの扱いは変えていない。
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("//") || /[\\\s]/.test(raw)) return null;
  if (raw.startsWith("/read/texts/")) return raw;
  if (isWordCardPath(raw)) return raw;
  return null;
}

/** クイズの画面の「戻る」ボタンの文字。戻り先が単語カードなら「単語カード」、それ以外（教材）は今までどおり */
export function returnLabels(returnTo: string | null | undefined): { short: string; long: string; title: string } {
  if (returnTo && isWordCardPath(returnTo)) {
    return { short: "単語カードへ", long: "単語カードに戻る", title: "単語クイズを開いた単語カードに戻る" };
  }
  return { short: "教材へ", long: "教材に戻る", title: "単語クイズを開いた教材に戻る" };
}

/** 教材画面の hash（#t=トークンID）から戻り先の語を取り出す */
export function tokenIdFromHash(hash: string): string | null {
  const m = /^#t=([^&]+)$/.exec(hash);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

// ---------------------------------------------------------------------------
// 文法道場の単元ページの戻り先（2026-11-06。文法道場の見直し ⑥）。
// 単元ページ（/read/grammar/:topicId）は教材・学び始め・単語道場からも開く。どこから来ても「← 文法道場」だったので、
// 来た所を ?back=<パス> で受け取り、戻るリンクの行き先と文字を変える。上の単語クイズ用の関数の動きは変えていない。

/** 単元ページの戻り先。fromOutside＝道場ホーム以外（教材・学び始め・単語道場）から来た */
export type DojoBack = { path: string; label: string; fromOutside: boolean };

const DOJO_HOME = "/read/grammar";

/**
 * 受け取った戻り先が、通してよいアプリ内のパスなら返す。それ以外は null。
 * 通すのは 教材（/read/texts/…）・学び始め（/manabinaoshi）・単語道場（/tango-dojo）・文法道場ホーム（/read/grammar）だけ。
 * 外の URL・「//」で始まるもの・空白や「\」を含むもの・別の画面は通さない。
 */
export function safeDojoBackPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\s]/.test(raw)) return null;
  const path = raw.split(/[?#]/)[0];
  if (path.split("/").includes("..")) return null; // 「..」で別の画面へ抜けるパスは通さない
  if (path.startsWith("/read/texts/") && path.length > "/read/texts/".length) return raw;
  if (path === "/manabinaoshi" || path === "/tango-dojo" || path === DOJO_HOME) return raw;
  return null;
}

/** 戻るリンクの行き先と文字。back が無い・通せない値のときは今までどおり「← 文法道場」 */
export function dojoBack(raw: string | null | undefined): DojoBack {
  const path = safeDojoBackPath(raw);
  const head = path?.split(/[?#]/)[0] ?? "";
  if (path && head.startsWith("/read/texts/")) return { path, label: "← 教材に戻る", fromOutside: true };
  if (path && head === "/manabinaoshi") return { path, label: "← 学び始めに戻る", fromOutside: true };
  if (path && head === "/tango-dojo") return { path, label: "← 見分けるに戻る", fromOutside: true };
  return { path: path ?? DOJO_HOME, label: "← 文法道場", fromOutside: false };
}

/** 単元ページの URL（戻り先つき）。戻り先が無ければ今までと同じ URL */
export function topicUrlWithBack(topicId: string, back: string | null | undefined): string {
  const base = `/read/grammar/${topicId}`;
  return back ? `${base}?back=${encodeURIComponent(back)}` : base;
}

/** 単元ページから解説ページへ行く URL。解説ページが「← ドリルに戻る」を出せるよう、来た単元（と、その単元の戻り先）を付ける */
export function referenceUrlFromTopic(topicId: string, back: string | null | undefined): string {
  const q = `from=${encodeURIComponent(topicId)}`;
  return `/read/reference/${topicId}?${q}${back ? `&back=${encodeURIComponent(back)}` : ""}`;
}

// ---------------------------------------------------------------------------
// 単語カード（/word/:lemma）の戻り先（2026-11-06。状態遷移の見直し 案 E）。
// 単語カードは単語ホームからも教材の語のカードからも開く。どこから来ても「← 単語」だったので、
// 教材から来たときは ?back=<教材のパス> で受け取り、教材のその語へ戻す。

const VOCAB_HOME = "/vocab";

/** 単語カードの URL（戻り先つき）。戻り先が無ければ今までと同じ URL */
export function wordCardUrlWithBack(lemma: string, back: string | null | undefined): string {
  const base = `/word/${encodeURIComponent(lemma)}`;
  return back ? `${base}?back=${encodeURIComponent(back)}` : base;
}

/**
 * 単語カードの戻るリンクの行き先と文字。
 * back が教材のパス（/read/texts/…。#t= つき可）なら「← 教材に戻る」、無い・それ以外なら今までどおり「← 単語」（単語ホーム）。
 * 通すパスの判定は文法道場の単元ページと同じ（safeDojoBackPath）。そのうち教材だけを使う。
 */
export function wordCardBack(raw: string | null | undefined): { path: string; label: string } {
  const path = safeDojoBackPath(raw);
  if (path && path.split(/[?#]/)[0].startsWith("/read/texts/")) return { path, label: "← 教材に戻る" };
  return { path: VOCAB_HOME, label: "← 単語" };
}

/**
 * 解説ページの「← ドリルに戻る」の行き先。?from= が単元の ID の形（英数字とハイフン）のときだけ、その単元ページの URL を返す。
 * それ以外（無い・パスや URL が入っている）は null ＝ リンクを出さない
 */
export function drillUrlFromReference(from: string | null | undefined, back: string | null | undefined): string | null {
  if (!from || !/^[a-z0-9][a-z0-9-]*$/i.test(from)) return null;
  return topicUrlWithBack(from, safeDojoBackPath(back));
}
