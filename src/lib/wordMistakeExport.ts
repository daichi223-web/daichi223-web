// src/lib/wordMistakeExport.ts
//
// 教員画面「単語の誤答を書き出す」の出力（CSV と印刷用の表）。
//   元データ = /api/teacher?action=usageStumbles&export=words（期間・学校・年・組・単語の番号範囲で絞った単語ごとの集計）。
//   PDF はこの印刷用ページをブラウザの「PDF に保存」で作る（日本語フォントを積まずに済む）。
//   生徒個人の行は入れない（単語ごとの人数の集計だけ）。

export type WordMistakeRow = {
  id: string; // qid
  n: number; // 回答数
  wrong: number; // 誤答数
  users: number; // 解いた人
  wrongUsers: number; // 間違えた人
  repeatUsers: number; // 2回以上間違えた人
  firstWrong: number; // 初回に間違えた人
  confused?: Array<{ id: string; n: number; users: number }>; // 何と間違えたか（多い順・上位3）
};

export type WordInfo = { lemma: string; sense: string };

export type ExportMeta = {
  from: string | null; // YYYY-MM-DD（JST・含む）
  to: string | null;
  scope: string; // 「KU 1年 3組」「登録済みの全員」など
  range: [number, number] | null;
  generatedAt: string; // ISO
  totals: { words: number; n: number; wrong: number };
};

export type ExportSort = "wrongUsers" | "number";

const wordNo = (qid: string) => {
  const m = /^(\d+)-(\d+)$/.exec(qid);
  return m ? [Number(m[1]), Number(m[2])] : [Number.MAX_SAFE_INTEGER, 0];
};

/** qid "123-2" の番号 123。形が違えば null */
export const noOf = (qid: string) => {
  const m = /^(\d+)-\d+$/.exec(qid);
  return m ? Number(m[1]) : null;
};

const rate = (a: number, b: number) => (b ? a / b : 0);

/** 並べ替え：間違えた人の多い順（同数は割合→番号）／番号順 */
export function sortRows(rows: WordMistakeRow[], sort: ExportSort): WordMistakeRow[] {
  const byNo = (a: WordMistakeRow, b: WordMistakeRow) => {
    const [a1, a2] = wordNo(a.id);
    const [b1, b2] = wordNo(b.id);
    return a1 - b1 || a2 - b2;
  };
  if (sort === "number") return [...rows].sort(byNo);
  return [...rows].sort(
    (a, b) =>
      b.wrongUsers - a.wrongUsers ||
      rate(b.wrongUsers, b.users) - rate(a.wrongUsers, a.users) ||
      b.repeatUsers - a.repeatUsers ||
      byNo(a, b),
  );
}

/** 0.123 → "12.3%"、分母0は "" */
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "");

const label = (qid: string, info: Record<string, WordInfo>) => {
  const w = info[qid];
  return w ? `${w.lemma}（${w.sense}）` : qid;
};

const confusedText = (r: WordMistakeRow, info: Record<string, WordInfo>) =>
  (r.confused ?? []).map((c) => `${label(c.id, info)} ${c.users}人・${c.n}回`).join(" ／ ");

/** 数えている出題形式（API が p_word_formats で選択式だけに絞る＝api/_wordRange.ts の CHOICE_WORD_FORMATS） */
export const FORMAT_TEXT = "選択式だけ（語→意味・意味→語・例文・空欄補充・多義語の例文理解。○×と記述は入れない）";

export const periodText =(m: Pick<ExportMeta, "from" | "to">) => `${m.from ?? "記録開始"} 〜 ${m.to ?? "今日"}`;
export const rangeText = (r: ExportMeta["range"]) => (r ? `${r[0]}〜${r[1]}番` : "全範囲");

/** ISO → JST の "YYYY-MM-DD HH:MM" */
const jstStamp = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace("T", " ");
};

// ---- CSV ----------------------------------------------------------------------------------

/** Excel で数式として読まれないよう、= + - @ で始まる文字列の頭に ' を付け、全体を " で囲む */
export function csvCell(v: string | number): string {
  if (typeof v === "number") return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
}

export const CSV_HEADER = [
  "番号",
  "qid",
  "語",
  "意味",
  "解いた人",
  "間違えた人",
  "間違えた人の割合",
  "初回に間違えた人",
  "2回以上間違えた人",
  "回答数",
  "誤答数",
  "誤答率",
  "何と間違えたか（多い順）",
];

/** 先頭に付ける BOM（U+FEFF）。Excel が UTF-8 と判断するための印 */
export const BOM = String.fromCharCode(0xfeff);

/** BOM 付き UTF-8・CRLF（Excel で開いて文字化けしない形） */
export function buildCsv(rows: WordMistakeRow[], info: Record<string, WordInfo>, meta: ExportMeta): string {
  const lines: string[] = [];
  lines.push([csvCell("期間"), csvCell(periodText(meta))].join(","));
  lines.push([csvCell("対象"), csvCell(meta.scope)].join(","));
  lines.push([csvCell("単語の範囲"), csvCell(rangeText(meta.range))].join(","));
  lines.push([csvCell("形式"), csvCell(FORMAT_TEXT)].join(","));
  lines.push([csvCell("作成"), csvCell(jstStamp(meta.generatedAt))].join(","));
  lines.push("");
  lines.push(CSV_HEADER.map(csvCell).join(","));
  for (const r of rows) {
    const w = info[r.id];
    lines.push(
      [
        noOf(r.id) ?? "",
        csvCell(r.id),
        csvCell(w?.lemma ?? ""),
        csvCell(w?.sense ?? ""),
        r.users,
        r.wrongUsers,
        csvCell(pct(r.wrongUsers, r.users)),
        r.firstWrong,
        r.repeatUsers,
        r.n,
        r.wrong,
        csvCell(pct(r.wrong, r.n)),
        csvCell(confusedText(r, info)),
      ].join(","),
    );
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

// ---- 印刷用の表（→ PDF に保存） --------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");


/** A4 縦の印刷用ページ。開くと印刷ダイアログを出す（autoPrint=false で出さない＝確認用） */
export function buildPrintHtml(
  rows: WordMistakeRow[],
  info: Record<string, WordInfo>,
  meta: ExportMeta,
  sort: ExportSort,
  autoPrint = true,
): string {
  const t = meta.totals;
  const body = rows
    .map((r, i) => {
      const w = info[r.id];
      return `<tr>
<td class="n">${i + 1}</td>
<td class="n">${esc(String(noOf(r.id) ?? r.id))}</td>
<td class="w"><b>${esc(w?.lemma ?? r.id)}</b><span class="s">${esc(w?.sense ?? "")}</span></td>
<td class="n">${r.wrongUsers}／${r.users}<span class="p">${pct(r.wrongUsers, r.users)}</span></td>
<td class="n">${r.firstWrong}</td>
<td class="n">${r.repeatUsers}</td>
<td class="n">${r.wrong}／${r.n}<span class="p">${pct(r.wrong, r.n)}</span></td>
<td class="c">${esc(confusedText(r, info)) || "—"}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>単語の誤答 ${esc(periodText(meta))} ${esc(rangeText(meta.range))}</title>
<style>
@page { size: A4 portrait; margin: 12mm 10mm; }
* { box-sizing: border-box; }
body { font-family: "BIZ UDPGothic", "Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif; color: #111; font-size: 10pt; margin: 0; padding: 12px; }
h1 { font-size: 14pt; margin: 0 0 4px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 6px; font-size: 9.5pt; }
.meta b { font-weight: 600; margin-right: 4px; }
.sum { display: flex; gap: 8px; margin: 6px 0 8px; }
.sum div { border: 1px solid #999; padding: 4px 10px; }
.sum div span { display: block; font-size: 8pt; color: #444; }
.sum div strong { font-size: 13pt; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 1px solid #888; padding: 3px 5px; vertical-align: top; }
th { background: #eee; font-weight: 600; font-size: 8.5pt; white-space: nowrap; }
td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
td.w .s { display: block; font-size: 8.5pt; color: #333; }
td .p { display: block; font-size: 8pt; color: #444; }
td.c { font-size: 8.5pt; }
.note { font-size: 8pt; color: #444; margin-top: 6px; line-height: 1.5; }
.bar { margin-bottom: 8px; }
@media print { .bar { display: none; } body { padding: 0; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">印刷 / PDF に保存</button>　送り先で「PDF に保存」を選ぶと PDF になります。</div>
<h1>単語の誤答（古文単語）</h1>
<div class="meta">
<div><b>期間</b>${esc(periodText(meta))}</div>
<div><b>対象</b>${esc(meta.scope)}</div>
<div><b>単語の範囲</b>${esc(rangeText(meta.range))}</div>
<div><b>形式</b>${esc(FORMAT_TEXT)}</div>
<div><b>並び</b>${sort === "number" ? "番号順" : "間違えた人の多い順"}</div>
<div><b>作成</b>${esc(jstStamp(meta.generatedAt))}</div>
</div>
<div class="sum">
<div><span>回答のあった語（意味）</span><strong>${t.words}</strong></div>
<div><span>回答数</span><strong>${t.n}</strong></div>
<div><span>誤答数</span><strong>${t.wrong}</strong></div>
<div><span>誤答率</span><strong>${pct(t.wrong, t.n) || "—"}</strong></div>
</div>
<table>
<thead><tr><th>#</th><th>番号</th><th>語（意味）</th><th>間違えた人／解いた人</th><th>初回に<br>間違えた人</th><th>2回以上<br>間違えた人</th><th>誤答／回答</th><th>何と間違えたか（多い順）</th></tr></thead>
<tbody>
${body || '<tr><td colspan="8">この条件で回答のあった単語はありません。</td></tr>'}
</tbody>
</table>
<p class="note">選んだ期間の単語クイズの選択式の回答（○×・記述と「もう一度」の再出題を除く）を、登録済みの生徒について数えています。「初回」は各生徒がこの期間に最初に解いた1回、「2回以上」は期間内に同じ語（意味）を2回以上間違えた人です。「何と間違えたか」は選んだ誤りの選択肢の上位3つです。人数は単語ごとに数えているので、合計すると同じ人が重なります。</p>
${autoPrint ? "<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>" : ""}
</body></html>`;
}
