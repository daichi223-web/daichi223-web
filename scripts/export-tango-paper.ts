/**
 * export-tango-paper.ts — 紙の古文単語テスト用データの書き出し（読み取り専用の ETL。DB・ネットには接続しない）。
 *
 * 入力: src/data/kobunQ.v2.slim.json（正）、src/data/kobunQ.v2.json（jpBlank・translationBlank・keigo）、
 *       scripts/export-tango-paper.exclude.json（除外の表。--exclude で変更）
 * 出力: 既定 F:/A2A/_work/koten-tango-design/tango-paper.json
 *   {tool:'kobun-tan-tango-paper', version:1, made, seed, words:[…]}
 *   words = slim の group<=330 から 268-4 を除いた 638 意味（番号→意味番号順）
 *
 * 四択（sel）は「紙用の規則」で作る（活用の処理 optionForms の conjugate / exampleFittedLabels は一切通さない）:
 *   - 4 つとも辞書の形。表示 = senseNorm（無ければ sense の〔 〕の中）を「・」（（ ）の外）で分けた最初の言い方から（ ）の注記を外したもの。
 *     正解の表示（sel.ans）も同じ関数。外すと空・助詞だけになる／同じ見出し語の別の意味と表示が同じになるときは外さない（kept）。
 *   - 誤答 3 つは別の見出し語の意味だけ（罠は使わない）。kind = near(±10)/mid(±30)/all。
 *   - tier（語尾の類は表示の形で分ける: ～を含む呼応／名詞／副詞／〜ない／〜い／〜だ・な／う段の動詞／〜に・く・と など副詞的／その他）:
 *     1 同じ品詞（敬語は敬語どうし）かつ同じ類 → 3 同じ類（品詞は問わない）。類が合わないものには落とさない（tier2・4 は使わない）。
 *     各 tier の中は near→mid→all、各距離の中は字数の近い語を優先（同じ字数は qid ごとの固定 seed のシャッフル順）。
 *     3 つに満たない問は sel=null・selSkip='rule: …'。正解が 1 文字の問は誤答を 2 文字以下の語に限る。
 *   - 外すもの: a 表示が正解・他の誤答と同じ／b 正解の見出し語のどの意味とも言い方（「・」で分けた全部）が 1 つでも一致、
 *     誤答の語の全意味についても同じ（isSameMeaning も使う）／c exclude.json の pairs（並べない組）と noDistractor（誤答に使わない意味）／
 *     d 1 文字の表示（誤答のみ）。exclude.json の noSel の意味は sel=null・selSkip='exclude: 理由'。
 *   誤答の母集団は group<=330（268-4 を除く）の語だけ。
 *
 * 使い方: node_modules/.bin/tsx scripts/export-tango-paper.ts [--out パス] [--seed 数] [--exclude exclude.json のパス]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'F:/A2A/_work/koten-tango-design/tango-paper.json');
const SEED = Number(opt('--seed', '20261111'));
const EXCL = opt('--exclude', join(root, 'scripts/export-tango-paper.exclude.json'));

const { isSameMeaning, isSameLemma } = await import('../src/lib/senseEquivalence.ts');
const { translationBlank } = await import('../src/lib/quiz/optionForms.ts');
const { shuffle } = await import('../src/lib/shuffle.ts');

const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const slim: any[] = readJson('src/data/kobunQ.v2.slim.json');
const v2: any[] = readJson('src/data/kobunQ.v2.json');
const v2ByQid = new Map<string, any>(v2.map((w) => [w.qid, w]));

const BLANK = '〔　　　〕'; // Excel の空欄記号（〔＋全角空白3つ＋〕）
const EXCLUDE = new Set(['268-4']);
const words = slim
  .filter((s) => s.group <= 330 && !EXCLUDE.has(s.qid) && s.examples?.length)
  .sort((a, b) => a.group - b.group || a.meaning_idx - b.meaning_idx);

// 乱数: qid ごとの固定 seed（mulberry32。getChoices.test.ts と同じ式）
const fnv = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };
const seeded = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const nrm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');
const stripBr = (s: string) => s.replace(/[〔〕]/g, '').trim();
// ====== 四択の部品（紙用）
const slimByLemma = new Map<string, any[]>();
for (const r of slim) { const l = slimByLemma.get(r.lemma); if (l) l.push(r); else slimByLemma.set(r.lemma, [r]); }
const senseText = (r: any): string => r.senseNorm ?? stripBr(r.sense ?? '');
/** 「・」（（ ）の外）で分ける */
const splitTop = (sn: string): string[] => {
  const out: string[] = []; let depth = 0; let cur = '';
  for (const ch of sn) {
    if (ch === '（' || ch === '(') depth++;
    else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === '・') { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
};
const stripParen = (s: string) => s.replace(/[（(][^（）()]*[）)]/g, '').trim();
const nz = (s: string) => s.normalize('NFKC').replace(/〜/g, '～').replace(/\s+/g, '');
/** 言い方の集合（注記を外して正規化） */
const pieces = (r: any): Set<string> => new Set(splitTop(senseText(r)).map((x) => nz(stripParen(x))).filter(Boolean));
const keigoOf = new Map<string, boolean>(v2.map((r) => [r.qid, !!r.keigo]));
/** 表示: 最初の言い方から（ ）の注記を外す。外すと空・助詞だけになる／同じ見出し語の別の意味と同じ表示になるときは外さない */
const dispOf = (r: any): { disp: string; kept: boolean } => {
  const f = splitTop(senseText(r))[0] ?? '';
  const st = stripParen(f);
  const sib = (slimByLemma.get(r.lemma) ?? []).filter((x) => x.qid !== r.qid).map((x) => stripParen(splitTop(senseText(x))[0] ?? ''));
  const keep = !st || /^[〜～]?[をにがでとはもへのて]{1,2}$/.test(st) || sib.includes(st);
  return { disp: keep ? f : st, kept: keep && f !== st };
};
/** 語尾の類（表示の形で分ける。語尾が動詞にも副詞にもなる文字（く・う段）と名詞だけ品詞で補う）:
 *  kou/kouN=「～」を含む呼応の語（kouN=否定で終わる）／nai=〜ない／i=〜い／da=〜だ／na=〜な／no=〜の／ta=〜た（たいした 等）／
 *  u=う段の動詞形（〜く は品詞が動詞のときだけ。〜う・す・つ・ぬ・ぶ・む・る は副詞でなければ）／adv=副詞的（〜に・と・て・で・も・り・ら・ず、〜く、副詞の〜う 等）／other=名詞ほか */
const endCls = (d: string, pos: string): string => {
  const n = nz(d);
  if (n.includes('～')) return /ない|ません|ず$|ぬ$|じ$/.test(n) ? 'kouN' : 'kou';
  if (pos === '名詞') return 'other';
  if (/ない$/.test(n)) return 'nai';
  if (/い$/.test(n)) return 'i';
  if (/だ$/.test(n)) return 'da';
  if (/な$/.test(n)) return 'na';
  if (/の$/.test(n)) return 'no';
  if (/た$/.test(n)) return 'ta';
  if (/く$/.test(n)) return pos === '動詞' ? 'u' : 'adv';
  if (/[うぐすつぬぶむる]$/.test(n)) return pos === '副詞' ? 'adv' : 'u';
  if (/[にとてでもりらず]$/.test(n)) return 'adv';
  return 'other';
};
type Info = { qid: string; lemma: string; group: number; pos: string; kg: boolean; posCls: string; disp: string; kept: boolean; end: string; row: any };
const info = new Map<string, Info>();
for (const r of words) {
  const { disp, kept } = dispOf(r);
  const kg = keigoOf.get(r.qid) ?? false;
  info.set(r.qid, { qid: r.qid, lemma: r.lemma, group: r.group, pos: r.pos ?? '', kg, posCls: kg ? '敬語' : (r.pos ?? ''), disp, kept, end: endCls(disp, r.pos ?? ''), row: r });
}

// ---- 除外の表（export-tango-paper.exclude.json）。除外はこのファイルだけを読む
//   pairs: 並べない組（pairScope='group' なら見出し語番号の組として両向きに効かせる）／noDistractor: 誤答に使わない意味／noSel: 四択にしない意味
const gnum = (q: string) => Number(q.split('-')[0]);
const excl = JSON.parse(readFileSync(EXCL, 'utf8')) as {
  pairScope: string; pairs: { a: string; b: string }[]; noDistractor: { qid: string }[]; noSel: { qid: string; why: string }[];
};
const pairBlock = new Set<string>();
for (const p of excl.pairs) {
  const a = excl.pairScope === 'group' ? String(gnum(p.a)) : p.a;
  const b = excl.pairScope === 'group' ? String(gnum(p.b)) : p.b;
  pairBlock.add(`${a}|${b}`); pairBlock.add(`${b}|${a}`);
}
const pairKey = (x: Info, y: Info) => (excl.pairScope === 'group' ? `${x.group}|${y.group}` : `${x.qid}|${y.qid}`);
const noDistractor = new Set(excl.noDistractor.map((x) => x.qid));
const noSel = new Map(excl.noSel.map((x) => [x.qid, x.why]));
console.error(`exclude: pairs ${excl.pairs.length}, noDistractor ${noDistractor.size}, noSel ${noSel.size}`);
const sameAny = (as: any[], bs: any[]) => as.some((a) => bs.some((b) => {
  const pb = pieces(b);
  for (const p of pieces(a)) if (pb.has(p)) return true;
  return isSameMeaning(a, b);
}));
/** 正解 me の誤答にしてよい語か（a の「他の誤答と同じ」は選びながら見る） */
const eligible = (me: Info, c: Info): boolean => {
  if (c.lemma === me.lemma || isSameLemma(c.row, me.row)) return false;
  if (c.disp.length <= 1) return false; // d
  if (nrm(c.disp) === nrm(me.disp)) return false; // a（正解と同じ）
  if (noDistractor.has(c.qid)) return false; // 除外表: 誤答に使わない意味
  if (pairBlock.has(pairKey(me, c))) return false; // 除外表: 並べない組
  const wm = slimByLemma.get(me.lemma) ?? [me.row];
  const cm = slimByLemma.get(c.lemma) ?? [c.row];
  if (sameAny(cm, wm)) return false; // b（正解の見出し語の全意味 × 誤答の見出し語の全意味）
  return true;
};
/** 誤答 3 つ。tier1 = 同じ品詞（敬語は敬語）かつ同じ語尾の類、tier3 = 同じ語尾の類（品詞は問わない＝そろう範囲を全体に広げる）。
 *  類が合わないものには落とさない（tier2・4 は使わない）。各 tier の中は near→mid→all、各距離の中は字数の近いものを優先（同字数はシャッフル順）。
 *  3 つに満たなければ skip に理由を返す。正解が 1 文字のときは誤答を 2 文字以下の語に限る。 */
const pickWrong = (me: Info, rng: () => number): { wrong: any[]; skip?: string } => {
  const oneChar = [...me.disp].length === 1;
  const pool = [...info.values()].filter((c) => c.qid !== me.qid && eligible(me, c) && (!oneChar || [...c.disp].length <= 2));
  const picked: any[] = [];
  const d = (c: Info) => Math.abs(c.group - me.group);
  const gap = (c: Info) => Math.abs([...c.disp].length - [...me.disp].length);
  const ord = (arr: Info[]) => shuffle(arr, rng).sort((x, y) => gap(x) - gap(y));
  for (const t of [1, 3]) {
    if (picked.length >= 3) break;
    const cand = pool.filter((c) => (t === 1 ? c.posCls === me.posCls && c.end === me.end : c.end === me.end));
    const ordered = [
      ...ord(cand.filter((c) => d(c) <= 10)),
      ...ord(cand.filter((c) => d(c) > 10 && d(c) <= 30)),
      ...ord(cand.filter((c) => d(c) > 30)),
    ];
    for (const c of ordered) {
      if (picked.length >= 3) break;
      if (picked.some((o) => o.qid === c.qid || nrm(o.disp) === nrm(c.disp) || o.lemma === c.lemma || isSameLemma(o.row, c.row))) continue; // a（誤答どうし）
      picked.push({ ...c, kind: d(c) <= 10 ? 'near' : d(c) <= 30 ? 'mid' : 'all', tier: t });
    }
  }
  return picked.length >= 3 ? { wrong: picked } : { wrong: picked, skip: oneChar ? 'rule: 1文字で2文字以下の名詞がそろわない' : 'rule: 類がそろわない' };
};

const out: any[] = [];
const problems: string[] = [];

for (const w of words) {
  const ex = w.examples[0];
  const mark: [number, number][] = ex.mark ?? [];
  if (mark.length === 0) problems.push(`${w.qid}: mark が無い`);
  const go = mark.map(([a, l]) => ex.jp.slice(a, a + l)).join('～');

  // 例文空欄
  const v2ex = v2ByQid.get(w.qid)?.examples?.[0];
  let exBlank: string; let exBlankSrc: 'excel' | 'mark';
  if (v2ex && v2ex.jp === ex.jp && v2ex.jpBlank) { exBlank = v2ex.jpBlank; exBlankSrc = 'excel'; }
  else {
    let s = ''; let pos = 0;
    for (const [a, l] of mark) { s += ex.jp.slice(pos, a) + BLANK; pos = a + l; }
    exBlank = s + ex.jp.slice(pos); exBlankSrc = 'mark';
  }
  // 訳空欄
  let yakuBlank: string; let yakuBlankSrc: 'excel' | 'made';
  if (v2ex && v2ex.jp === ex.jp && v2ex.translationBlank) { yakuBlank = v2ex.translationBlank; yakuBlankSrc = 'excel'; }
  else { yakuBlank = ex.translation.replace(/〔[^〕]*〕/g, BLANK); yakuBlankSrc = 'made'; }
  const yakuAns = translationBlank(ex.translation) ?? '';

  // ---- 四択（紙用の規則）。表示は dispOf、誤答の選び方は pickWrong、四択にしない意味は sel=null・selSkip
  const rng = seeded((fnv(w.qid) ^ SEED) >>> 0);
  const me = info.get(w.qid)!;
  let sel: any = null; let selSkip: string | undefined;
  const why = noSel.get(w.qid);
  if (why) selSkip = 'exclude: ' + why;
  else {
    const r = pickWrong(me, rng);
    if (r.skip) selSkip = r.skip;
    else sel = {
      ans: me.disp,
      ...(me.kept ? { ansKept: true } : {}),
      wrong: r.wrong.map((c: any) => ({
        label: c.disp, from: c.qid, kind: c.kind, tier: c.tier, lemma: c.lemma, pos: c.pos,
        ...(c.kg ? { kg: true } : {}), ...(c.kept ? { kept: true } : {}),
      })),
    };
  }

  out.push({
    qid: w.qid, no: w.group, lemma: w.lemma,
    meaning: w.senseNorm ?? stripBr(w.sense ?? ''), core: w.senseCore ?? '', pos: w.pos ?? '',
    ex: ex.jp, exSrc: ex.source ?? '', mark,
    exBlank, exBlankSrc, go,
    yaku: ex.translation, yakuBlank, yakuBlankSrc, yakuAns,
    sel,
    ...(selSkip ? { selSkip } : {}),
  });
}

const doc = { tool: 'kobun-tan-tango-paper', version: 1, made: new Date().toISOString().slice(0, 10), seed: SEED, words: out };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ out: OUT, words: out.length, sel: out.filter((x) => x.sel).length, skip: out.filter((x) => !x.sel).length, problems }));
