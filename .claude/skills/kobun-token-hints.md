---
name: kobun-token-hints
description: kobun-tan 教材の texts-v3/{id}.json のトークンに学習ポイント (token.hint) を付与し、対応する NotebookLM MD にも差分を逆反映する。GrammarPopover の「重要ポイント」黄色枠を充実させるためのパイプライン。
triggers:
  - "トークンの重要ポイント"
  - "token.hint 拡充"
  - "語の重要ポイント"
  - "各レイヤーの重要ポイント"
  - "読解の解説を充実"
  - "kobun-tan hint enrichment"
---

# kobun-tan トークン重要ポイント拡充

kobun-tan の読解画面で token をタップすると `GrammarPopover` が開く。`token.hint` に値があるときだけ「重要ポイント」黄色枠が表示される。既存教材のほとんどは hint が空で、v3 からポートした 2 教材（ちごのそらね・絵仏師良秀）にのみ hint がある。このスキルで残り教材にも展開する。

## 対象

- テキスト JSON: `F:\A2A\apps-released\kobun-tan\public\texts-v3\{id}.json`
- 参照 MD: `F:\A2A\NotebookLM\kokugo-vault\30-教材\古文\**\*.md` (title で match)
- 追加先: 各 token の `hint` フィールド (string)

## 前提

- **既に完了した教材は再処理しない**。まずは下記コマンドで未処理教材を抽出:
  ```bash
  node -e "const d=require('./src/data/textsV3Index.json');const fs=require('fs');for(const t of d){const j=require(`./public/texts-v3/${t.id}.json`);let wh=0,tot=0;for(const s of j.sentences)for(const tok of s.tokens){tot++;if(tok.hint)wh++;}const pct=Math.round(wh/tot*100);if(pct<50)console.log(t.id,'|',t.title,'|',wh+'/'+tot,pct+'%');}" 2>&1 | head -20
  ```
- カバレッジ 50% 未満の教材が対象。50% 以上は既に充実していると判定。

## 追加対象の判定基準

実装経験 (バッチ1〜4 で 17 教材完了) を反映した拡張版。**8 カテゴリ**を網羅すること。

| カテゴリ | 判定条件 | hint 内容の方向性 |
|---|---|---|
| **1. 助動詞** | `grammarTag.pos === '助動詞'` | 意味・接続・活用型・識別ポイント (ず/ぬ/なり/む/り 等の同形異義注意) |
| **2. 係助詞・副助詞・終助詞** | `pos === '係助詞'/'副助詞'/'終助詞'` | 係結の結び形、強調/疑問/反語、願望「ばや/なむ/もがな」の識別 |
| **3. 敬語動詞** | `pos === '動詞'` かつ baseForm が「たまふ/まゐる/まうす/おはす/さぶらふ/きこゆ/思す/思しめす」等 | 尊敬/謙譲/丁寧 + 敬意の方向 |
| **4. 変格動詞・特殊動詞** | conjugationType に「サ変/カ変/ラ変/ナ変/下二/上二/上一/下一」 | 活用表の要点、代表形、識別頻出語 (ゐる/老ゆ/悔ゆ 等) |
| **5. 重要古今異義語** | 形容詞・形容動詞で、現代語と意味がずれるもの (あはれ/をかし/いみじ/うつくし/らうたし/はかなし/ゆかし/わびし/うたて 等) | 古文での意味、現代語との違い |
| **6. 複合動詞** | **`pos` が空でも text に動詞要素を含む** (出で来る・し出だす・寝入る・ひしめき合ふ・行きあふ 等) | 構成要素 (基動詞 + 接尾辞) と複合義 |
| **7. layer 0 重要古文常識語** | `layer === 0` で baseForm が「よし/さま/もの/こと/かたち/ありさま/よ/年ごろ/心地」等 | 多義語の意味分布、現代語との対応 |
| **8. layer 0 重要副詞** | `layer === 0` で `pos === '副詞'` の重要語 (いと/いとど/いつしか/さらに/え/みづから/おのづから/なほ/さばかり 等) | 呼応 (打消/反語/願望)、強調・程度 |

**スキップ対象**:
- 記号 (`pos === '記号'`) ・句読点 (text が「、」「。」のもの — pos がミスタグでも無視)
- 一般名詞 (人名・地名以外で文脈固有の語)
- 格助詞の一般用法 (の/に/を/と) は文脈固有の判別が必要なときだけ
- 既に hint がある token (上書き禁止)

## 重要: token.id の形式

**token.id はすでに `s1-t11` 形式 (sentence prefix 付き)**。スクリプト内でキー
を組み立てるときに `${s.id}-${tk.id}` のようにすると `s1-s1-t11` の二重に
なって全件ヒットしなくなる。**必ず `tk.id` を直接キーにする**。

## hint のスタイル

- **50〜120 字の 1 文**。冗長禁止
- 「辞書的定義」ではなく「学習者が覚えておくべきポイント」
- 文脈依存ではなく一般論として役立つ内容
- 同じ baseForm は同じ hint で統一
- 先頭に「助動詞「けり」:」「重要語「わびし」:」のようなラベルを付けると一覧性が上がる

### 良い例

```json
"hint": "助動詞「けり」: 伝聞過去 (〜た・〜たという) + 詠嘆 (〜だなあ)。連用形接続。物語の地の文で多用"
"hint": "重要語「わびし」: 現代語「侘しい」とは違う。「つらい・困った・やりきれない」が古語の基本義"
"hint": "係助詞「ぞ」: 強意。係り結びの結びは連体形。訳出不要が多い"
```

### 悪い例（避ける）

- 「これは助詞です」（自明、情報量ゼロ）
- 「春の訪れを喜ぶ気持ち」（文脈依存、一般化されていない）
- 「参照: [[語彙DB/けり]]」（リンクだけで解説がない）

## 実装手順 (推奨: スクリプト2パス方式)

Edit ツールでの直接編集はトークン数が多い教材で破綻する。**Node スクリプト
を書いて一括実行**するのが標準パターン。pass1 で広域ルール、pass2 で残り
ピンポイントの 2 段構え。

### 1. 対象教材の確認
未処理一覧から 1 本選ぶ。hint カバレッジが 50% 未満を優先。

### 2. 残骸の洗い出し
hint なしトークンを 3 種類で列挙:

```bash
node -e "
const t=require('./public/texts-v3/{id}.json');
const byPos={};
for(const s of t.sentences){
  for(const tk of s.tokens){
    if(tk.hint) continue;
    if(tk.layer===0 && !tk.grammarTag.baseForm) continue; // 一般名詞はスキップ
    const k=(tk.grammarTag.pos||'(none)');
    byPos[k]=(byPos[k]||0)+1;
  }
}
console.log(byPos);
console.log('--- pos なし複合動詞っぽいもの ---');
for(const s of t.sentences){
  for(const tk of s.tokens){
    if(tk.hint) continue;
    if(tk.grammarTag && tk.grammarTag.pos) continue;
    if(tk.text.length<2) continue;
    console.log(tk.id, tk.text);
  }
}
"
```

### 3. Pass1: ルールベース横展開スクリプト
`scripts/enrich-{id}-hints.cjs` を Write ツールで作成。

テンプレート構造:
```js
const fs = require('fs');
const path = require('path');
const fp = path.join(__dirname, '..', 'public', 'texts-v3', '{id}.json');
const distFp = path.join(__dirname, '..', 'dist', 'texts-v3', '{id}.json');
const t = JSON.parse(fs.readFileSync(fp, 'utf8'));

// 個別トークン (オプション、ピンポイント指定):
const pinpoint = {
  's1-t11': '...',  // ★ token.id を直接キーに (s1-s1-t11 にしない)
};

// pos+text パターンによる広域埋め:
function buildByPattern(tk) {
  if (tk.hint) return null;
  const g = tk.grammarTag || {};
  const text = tk.text;
  const pos = g.pos || '';
  const meaning = g.meaning || '';
  // ===== 助動詞 =====
  if (pos === '助動詞') {
    if (text === 'けり') return '助動詞「けり」: 過去 ＋ 詠嘆。連用形接続。';
    // ... 各助動詞
  }
  // ===== 形容詞 =====
  // ===== 副詞 =====
  // ===== 感動詞 =====
  // ===== 代名詞 =====
  // ===== 連体詞 =====
  // ===== 格助詞・接続助詞・係助詞 =====
  return null;
}

let added = 0;
for (const s of t.sentences) {
  for (const tk of s.tokens) {
    if (tk.hint) continue;
    let h = pinpoint[tk.id];  // ★ tk.id を直接 (sentence prefix 不要)
    if (!h) h = buildByPattern(tk);
    if (h) { tk.hint = h; added++; }
  }
}

// alignment 検証 + 書き出し
let ok = true;
for (const s of t.sentences) {
  if (s.tokens.map(tk => tk.text).join('') !== s.originalText) { ok = false; }
}
fs.writeFileSync(fp, JSON.stringify(t, null, 2), 'utf8');
fs.mkdirSync(path.dirname(distFp), { recursive: true });
fs.writeFileSync(distFp, JSON.stringify(t, null, 2), 'utf8');

// 結果報告
const all = t.sentences.flatMap(s => s.tokens);
console.log('Hints added:', added);
console.log('Total:', all.filter(tk => tk.hint).length, '/', all.length);
console.log('alignment ok:', ok);
// 残骸再確認
for (const s of t.sentences) for (const tk of s.tokens) {
  if (!tk.hint && tk.grammarTag && tk.grammarTag.pos) {
    console.log('残:', tk.id, tk.text, tk.grammarTag.pos);
  }
}
```

### 4. Pass2: ピンポイントで残りを埋める
pass1 の残骸出力 (特に複合動詞・layer 0 重要語) を見て、`enrich-{id}-hints-pass2.cjs`
を Write ツールで作成。pinpoint オブジェクトのみ持つ短いスクリプト。

```js
const pinpoint = {
  's5-t8': '名詞「よし (由)」: 〜のふり・〜の様子・由来・事情。「寝たるよしにて」=「寝ているふりをして」。',
  's5-t11': '複合動詞「出で来 (いでく)」(カ変): 出てくる・現れる。',
  // ...
};
```

両 pass を順番に node 実行。alignment が OK であることを必ず確認。

### 5. 検証コマンド (Total + meaningful + 残骸)

```bash
node -e "
const t=require('./public/texts-v3/{id}.json');
const all=t.sentences.flatMap(s=>s.tokens);
const total=all.filter(tk=>tk.hint).length;
const meaningful=all.filter(tk=>(tk.layer&&tk.layer>0)||(tk.grammarTag&&tk.grammarTag.pos));
const mh=meaningful.filter(tk=>tk.hint).length;
console.log('Total:', total+'/'+all.length, '('+Math.round(total/all.length*100)+'%)');
console.log('Meaningful:', mh+'/'+meaningful.length, '('+Math.round(mh/meaningful.length*100)+'%)');
console.log('--- 残った pos あり hint なし ---');
for(const s of t.sentences) for(const tk of s.tokens){
  if(!tk.hint && tk.grammarTag && tk.grammarTag.pos){
    console.log(' ', tk.id, tk.text, tk.grammarTag.pos);
  }
}
"
```

**目標カバレッジ**:
- Total: 60% 以上 (一般名詞は除外されるので 70% 超は難しい)
- Meaningful (pos あり または layer>0): **90% 以上**
- 残骸の許容: 句読点 (「、」「。」) で pos ミスタグの artefact のみ

### 6. MD 側の逆反映

JSON hint に書いた内容が MD 側の記述より詳しい/新しい場合、MD にも加筆する:

- 新重要古語 → MD の「用語解説」テーブルに行を追加
- 新文法識別ポイント → 「学習ポイント > 文法の要点」の続き番号で追加
- 新敬語解説 → 「登場人物と敬語分析 > 敬語分析」に追記

**既存 MD の構造・番号体系を絶対に破壊しない**。追記のみ。

### 7. コミット

```bash
git add public/texts-v3/{id}.json "F:\A2A\NotebookLM\kokugo-vault\30-教材\古文\**\{title}.md"
git commit -m "feat: {教材名} トークン重要ポイント拡充 + MD 逆反映 (N hints added)"
git push origin main
```

## 参考実装 (バッチ4 までの 17 教材)

| 教材 | スクリプト | 結果 |
|---|---|---|
| ちごのそらね | `scripts/enrich-chigo-no-sorane-hints.cjs` + `pass2.cjs` | 124→170 (78%, meaningful 98%) |
| 絵仏師良秀 | v3 ポート | (高カバレッジ完了) |
| 母子の別離 | `enrich-0a93657296-hints.cjs` + `pass2` | 6→317 (64%, meaningful 98%) |
| 萩のうは露 | `enrich-467249bc39-hints.cjs` | 6→237 (66%, meaningful 97%) |
| 雲林院にて | `enrich-61ad02e1df-hints.cjs` (canonical 同梱型) | 173→383 (64%, meaningful 98%) |
| 車争ひ | `enrich-364673ceb1-hints.cjs` | 7→259 (54%, meaningful 75%) |

**スクリプト命名**: `scripts/enrich-{id}-hints.cjs` で統一。pass2 は `-hints-pass2.cjs`。

## 並列化のコツ

- 1 教材に付き **subagent 1 体** に script 作成 + 実行を委任
- 一度に並列 4-5 本が経験上安定 (rate limit 到達しない)
- バッチごとに `git commit` + `git push`、次バッチ起動の繰り返し
- **コミットメッセージ命名**: `fix: 重要4教材 正典照合 + token.hint 完成 (バッチN)` で統一

## 落とし穴 (実装で遭遇した実例)

### 1. token.id 二重 prefix
最も多いミス。token.id がすでに `s1-t11` 形式なのに、`${s.id}-${tk.id}` で
組み立てて `s1-s1-t11` になり全件マッチしない。**必ず `tk.id` を直接キーに**。

### 2. 複合動詞は pos 空
形態素解析の都合で「出で来る」「し出だし」「寝入り」のような複合動詞は
`grammarTag.pos` が空のことが多い。pos でフィルタすると見落とす。**text の
パターンマッチか pinpoint 指定で補う**。

### 3. 助動詞「ける」の baseForm 空
`pos === '助動詞'` でも baseForm が空のケースがある。text マッチ (text === 'ける')
で「けり連体形」と判定する。

### 4. 句読点が形容詞・副詞でミスタグ
「、」が pos=副詞、「。」が pos=形容詞 とミスタグされていることがある。
これらは無視してよい (hint を入れない)。

### 5. layer 0 古文常識語
「よし」「もの」「こと」「さま」などは layer=0 だが学習価値が高い。
pos+text パターンマッチで明示的に拾う。

### 6. dist/ ミラー忘れ
`public/texts-v3/{id}.json` を更新したら必ず `dist/texts-v3/{id}.json`
にもコピー。スクリプト内で `fs.copyFileSync` か `fs.writeFileSync` の
両方先を書く。

## 注意事項

- **v3 からポートした教材 (chigo, ebutsu) は既にコア部分が埋まっているので、
  pass2 (残骸狙い撃ち) のみで十分**
- tokens の分節は教材ごとに違うことがある (v3 13 文 vs tan 21 文 等)
- hint 追加後、`/read/texts/{id}` でトークンタップして `GrammarPopover` の
  「重要ポイント」黄色枠が表示されることを実機確認
- カバレッジ計測が drop する場合は validation failed を疑う (JSON パース失敗、
  alignment OK が false になっていないか確認)
- 教材ごとに固有名詞・古文常識を追加する場合は `kobun-cultural-context` スキルも参照
