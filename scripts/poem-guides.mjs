// 和歌教材の「歌ごとの解説」（2026-11-08〜、ユーザー指示「和歌の解説を充実させて」）
//
// 正本は kokugo-vault の教材 MD の「## 歌ごとの解説」節。1首＝1つの h3 で、本文の下に「- 見出し: 中身」の箇条書きを置く。
//
//   ## 歌ごとの解説
//
//   ### 1. 春の野に若菜つまむと来しものを散りかふ花に道はまどひぬ
//   - 歌人: 紀貫之
//   - 文: s3
//   - 出典: 『古今和歌集』巻第一 春歌上 116
//   - 歌意: …（2行目以降は2字下げで続けてよい）
//   - 修辞: …
//
// ここでは MD の節を guides JSON の `poems`（{ heading, items[] }）に変換する。
// 変換は convert-to-v3.mjs（全件）と build-poem-guides.mjs（1教材だけ guides を更新）が共用する。

/** 箇条書きの見出し → 画面に出す札。並びはこの順（MD に無い見出しは出ない） */
export const POEM_FIELD_LABELS = [
  ["出典", "出典"],
  ["詞書の状況", "詞書の状況"],
  ["歌意", "歌意"],
  ["構成・句切れ", "構成・句切れ"],
  ["修辞", "修辞"],
  ["文法のポイント", "文法のポイント"],
  ["語句", "語句"],
  ["鑑賞", "鑑賞"],
  ["背景", "背景"],
  ["入試のポイント", "入試のポイント"],
  ["関連する歌", "関連する歌"],
];
const FIELD_ORDER = new Map(POEM_FIELD_LABELS.map(([k], i) => [k, i]));
/** 画面に札として出さない見出し。歌人・文は JSON の属性にする。根拠は vault にだけ残す（確かめた資料の記録で、生徒には出さない） */
const META_KEYS = new Set(["歌人", "文", "根拠"]);

/**
 * 「## 歌ごとの解説」節の中身（見出し行は含まない）を items に変換する。
 * @param {string} md
 * @returns {{no:number,text:string,author?:string,refs:string[],fields:{key:string,label:string,body:string}[]}[]}
 */
export function parsePoemGuides(md) {
  const items = [];
  let cur = null;
  let curKey = null;
  const flush = () => {
    if (!cur) return;
    const fields = [...cur.raw.entries()]
      .filter(([k]) => !META_KEYS.has(k))
      .map(([k, v]) => ({ key: k, label: (POEM_FIELD_LABELS.find(([kk]) => kk === k) ?? [k, k])[1], body: v.trim() }))
      .filter((f) => f.body)
      .sort((a, b) => (FIELD_ORDER.get(a.key) ?? 99) - (FIELD_ORDER.get(b.key) ?? 99));
    const author = (cur.raw.get("歌人") ?? "").trim();
    const refs = (cur.raw.get("文") ?? "").split(/[、,\s・]+/).map((x) => x.trim()).filter(Boolean);
    items.push({ no: cur.no, text: cur.text, ...(author ? { author } : {}), refs, fields });
    cur = null;
    curKey = null;
  };
  for (const rawLine of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    const h = line.match(/^###\s+(\d+)[.．]\s*(.+)$/);
    if (h) {
      flush();
      cur = { no: Number(h[1]), text: h[2].trim(), raw: new Map() };
      continue;
    }
    if (!cur) continue;
    const b = line.match(/^-\s+([^:：]+?)\s*[:：]\s*(.*)$/);
    if (b) {
      curKey = b[1].trim();
      cur.raw.set(curKey, (cur.raw.get(curKey) ? cur.raw.get(curKey) + "\n" : "") + b[2]);
      continue;
    }
    if (curKey !== null && /^\s{2,}\S/.test(line)) {
      cur.raw.set(curKey, cur.raw.get(curKey) + "\n" + line.trim());
      continue;
    }
    if (line.trim() === "") continue;
    // 箇条書きの外の行（補足など）は直前の見出しに続ける
    if (curKey !== null) cur.raw.set(curKey, cur.raw.get(curKey) + "\n" + line.trim());
  }
  flush();
  return items;
}

/** guides JSON に入れる形 */
export function buildPoemsSection(md) {
  const items = parsePoemGuides(md);
  return items.length ? { heading: "歌ごとの解説", items } : null;
}
