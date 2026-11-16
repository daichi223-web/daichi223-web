// 空欄補充クイズ用データ (public/kobun-blanks.json) の遅延ロード。
// Excel 原本の手作業空欄 (jpBlank) を qid 単位で持つ。バンドル外・初回のみ fetch。

export interface BlankEntry {
  jp: string;          // 元の例文 (答え合わせ表示用)
  jpBlank: string;     // 〔　　　〕入りの例文
  translation: string; // 現代語訳 (ヒント)
}

let cache: Record<string, BlankEntry[]> | null = null;
let inflight: Promise<Record<string, BlankEntry[]>> | null = null;

// 取れたら覚える。取れなかったときは空を返すが覚えない（次の出題でもう一度試す。
// 2026-11-16：アプリを開いた時点で先読みするようにしたので、そのときの失敗を引きずらないため）
export async function loadBlanks(): Promise<Record<string, BlankEntry[]>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/kobun-blanks.json');
      if (res.ok) cache = (await res.json()) as Record<string, BlankEntry[]>;
    } catch {
      /* 取れなければ空欄なしで出題する */
    }
    inflight = null;
    return cache ?? {};
  })();
  return inflight;
}
