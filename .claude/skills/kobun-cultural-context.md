---
name: kobun-cultural-context
description: kobun-tan 教材に「古文常識（背景知識）」を 3 つの配置先（token.hint / layer5 詳細ポイント / 読解ガイド per-sentence culture hints）に振り分けて追加するパイプライン。本文に明示されない文化・歴史・宗教・風俗の前提知識を体系的に追記し、対応 NotebookLM MD にも逆反映する。
triggers:
  - "古文常識"
  - "背景知識"
  - "古文背景"
  - "読解の前提知識"
  - "古文常識追加"
  - "kobun cultural context"
---

# kobun-tan 古文常識（背景知識）拡充

kobun-tan の読解 (layer 5) で「主語の把握」「心理変化」など読解戦略は伝えているが、**当時の文化・社会・宗教・風俗** といった本文に明示されない前提知識（古文常識）が欠落している。本スキルでこれを各教材へ補充する。

## 古文常識とは

**古文常識**＝古文を読解する上で前提となる、当時の文化・社会・風俗・宗教観など、本文には明示されていないが意味が成り立つために必要な背景知識。

### スコープ内（本スキルで扱う）

- **暦・時刻**: 時刻名（暁/つとめて/夜更く/有明）、月の異名、節句、年中行事
- **方角・空間**: 方違へ、寝殿造、御簾・几帳・障子の構造、京の方位観、歌枕
- **婚姻・家族**: 妻問い婚、三日夜の餅、後朝の文、元服・裳着、母方育ち
- **身分・官職**: 律令官職（蔵人・弁官・近衛・受領）、三位以上の貴族、女房の身分
- **宗教**: 仏教思想（末法思想、阿弥陀信仰、無常観）、出家・受戒、物忌み、神祇信仰、陰陽道
- **建築・調度**: 寝殿造、僧坊、御簾・几帳・屏風、調度品
- **装束**: 衣冠・束帯・直衣、十二単（女房装束）、童形、僧衣
- **食物・生活**: 当時の食物、夜食慣習、入浴慣習
- **物の怪・呪術**: 物忌み、加持祈祷、生霊・死霊、方違え
- **作品・ジャンルの特徴**: 説話集の傾向（仏教 vs 世俗滑稽）、軍記物の語り、日記文学の私性
- **登場人物の社会的位置**: 「児」「受領」「女房」など類型キャラクターの背景
- **作法・礼儀**: 起こし方、呼びかけ方、文の取り次ぎ方、上下の作法

### スコープ外（別スキルで扱う）

- **語彙の意味（古今異義のみ）**: 重要古語の意味 → `kobun-token-hints` で `token.hint` に（ただし**文化的背景がある場合は本スキルでも token.hint に統合**）
- **文法**: 助動詞・助詞・敬語の識別 → `kobun-token-hints` で `token.hint` に
- **本文の心理・主語**: 既存の layer 5 read points で扱う

## 配置先 3 つの使い分け（重要）

古文常識は粒度・文脈によって **3 つの場所** に振り分ける。長すぎる記述を 1 箇所に押し込むと UI で煩雑になるため、必ず適切な場所を選ぶ。

### A) `token.hint` および MD `### 用語解説` テーブル（単語レベル）

**特定の語・固有名詞の説明として完結する**もの。
**例**: 「児」「比叡の山」「宵」「かいもちひ」「おどろく」「不動尊」「もののけ」「露」「鬼」「弓・胡簶」など。

- 形式: 80〜200 字。`[古文常識]` プレフィックスは付けない（普通の hint と一体化）
- 内容: **語義 + 当時の文化背景 + 読解上の効き目**を一体で。例: "「おどろく」: 古語で『目を覚ます』の意（現代語『驚く』と異義）。当時、貴人を直接揺すって起こすのは無作法とされ、声をかけて間接的に目覚めさせるのが礼。本作では僧が児を起こす丁寧な作法として用いる。"
- 同じ baseForm が複数 token に出る場合、**最初の出現**にだけ詳細 hint、以降は短く（または無しで）OK
- MD 側は `### 用語解説` テーブルの該当行を拡充。新規語なら行を追加

### B) `learningPoints.byLayer[layer:5].points` に `[古文常識]` プレフィックス（教材全体レベル）

**広い文化概念で複数の語に跨る、教材全体の読み筋を支える**もの。
**例**: 「宇治拾遺物語の笑話伝統」「平安貴族の身分差と婚姻制度」「中世の道・業の芸道思想」「歌物語ジャンル」「体面意識の文化」など。

- 形式: 150〜350 字。`[古文常識]` プレフィックス必須
- 内容: 文化制度・思潮・ジャンル論など面的な説明 + 本作との関連を末尾で明示
- 1 教材あたり **2〜4 項目** が目安（refactor 後）
- MD 側は `### 古文常識（背景知識）` 節を新設し既存番号の続きで追加

### C) reading guide の per-sentence `culture` 型ヒント（文脈レベル）

**特定の文の読解にその時点で必要**な古文常識。読み手が層 5 で本文をたどるときに、その場で参照したい知識。
**例**: 「s1 の比叡山と僧坊」「s5 のおどろかせたまへの作法」「s11 のオチ＝宇治拾遺物語の笑話伝統」「s5 の鬼観念」「s2 の業平と高子の身分差」など。

- 場所: `public/reading/{id}.json` の各 `annotations[].hints[]` に `{type:"culture", label:"古文常識: <短い見出し>", points:[...]}` を追加
- 形式: `points` は 2〜3 件、各 60〜120 字
- UI で 🏛️ アイコン（rose 系配色）で表示
- 1 教材あたり **4〜7 文** が目安。全文には付けない、論理進行の節目に配置
- 既存 hints (subject/grammar/vocab/structure/method) は触らない、追加のみ

## 配置の判定フロー

ある古文常識項目について、以下の問いで配置先を決める:

```
特定の語の意味 + 文化背景で説明できるか？
├─ Yes → A) token.hint / 用語解説
└─ No
   │
   その文化概念は文の特定の場面で効くか？
   ├─ Yes → C) reading guide culture hint（その文に配置）
   └─ No → B) layer 5 詳細ポイント（教材全体に通底するなら）
```

A) と C) は**併用可**: 例えば「鬼」を語として token.hint に置きつつ、「鬼が現れる場面 (s5)」で reading guide の culture hint としても置く。粒度が違う。

## 参考実装（3 教材完了済み）

| 教材 | A) token.hint | B) layer 5 詳細 | C) reading culture |
|---|---|---|---|
| ちごのそらね | 児/宵/かいもちひ/おどろく | 宇治拾遺物語のジャンル / 体面意識 | s1/s2/s5/s6/s8/s11 計 6 件 |
| 絵仏師良秀 | 絵仏師/不動尊/火炎/もののけ | 京の頻発火災 / 道・業の芸道思想 / 妻子より芸の価値観 | s1/s2/s12/s14/s17 計 5 件 |
| 芥川 | 露/鬼/弓・胡簶 | 身分差と婚姻制度 / 歌物語ジャンル / 二条の后 | s2/s3/s5×2/s6/s11 計 6 件 |

## 対象ファイル

- 本文 JSON (書込): `F:\A2A\apps-released\kobun-tan\public\texts-v3\{id}.json`
- 本文 JSON ミラー (書込): `F:\A2A\apps-released\kobun-tan\dist\texts-v3\{id}.json`
- 読解 JSON (書込): `F:\A2A\apps-released\kobun-tan\public\reading\{id}.json`
- 読解 JSON ミラー (書込): `F:\A2A\apps-released\kobun-tan\dist\reading\{id}.json`
- 参照 MD (書込): `F:\A2A\NotebookLM\kokugo-vault\30-教材\古文\**\{title}.md`

## 何項目追加するか

- A) token.hint: 単語数次第。3〜6 件
- B) layer 5 詳細: 2〜4 件
- C) reading culture: 4〜7 件（文の論理進行に沿って配置）
- 合計: 10〜15 件相当の知識を 3 場所に分散

文化的背景が豊富な作品（源氏物語・大鏡・平家物語など）は各カテゴリで上限近く。短編・教訓説話など背景が薄いものは下限で十分。

## 抽出の判定基準

各教材について、以下の問いを立てる:

1. **本文に登場する固有名詞・場所名・建物名は何の象徴か？**（例: 比叡山＝天台宗根本道場）→ A
2. **本文の登場人物の社会的位置は明示されているか？**（例: 児＝寺院に預けられた貴族の子）→ A
3. **本文の出来事の理解に、当時の慣習・作法の知識が必要か？**（例: 起こす作法）→ A or C
4. **登場する物・食物・装束は当時どう位置づけられていたか？**（例: かいもちひ＝寺院の贅沢）→ A
5. **作品ジャンル自体に読解上の特徴があるか？**（例: 宇治拾遺物語＝滑稽譚多し）→ B or C（最終文に C）
6. **本文の心理・行動を支える価値観は何か？**（例: 体面意識・末法思想）→ B
7. **特定の場面の読解にだけ要る知識は？**（例: 鬼の登場場面の鬼観念）→ C

## 実装手順

### 1. 対象教材の選定とリサーチ

- hint カバレッジ ≥50% 教材から、文化的背景が読解に効くものを優先
- 本文・既存 learningPoints (overview/byLayer) と既存 token.hint を読み、重複しない論点を抽出

### 2. 古文常識項目を 10〜15 件リストアップ

判定基準 7 問いに沿って項目を立てる。各項目について A/B/C のどこに置くかを決める。

### 3. A) token.hint への追加

該当 token を `sentences[].tokens[]` から特定し、`hint` フィールドに追記（既存があれば内容を統合、上書きしない）。80〜200 字、語義 + 文化背景 + 読解上の効き目を一体化。

### 4. B) layer 5 詳細ポイントへの追加

`learningPoints.byLayer[layer:5].points` 末尾に `[古文常識] {見出し}: {解説 150〜350 字}` を追加。`priority: "important"` 基本。

### 5. C) reading guide culture hints への追加

`public/reading/{id}.json` の `annotations[].hints[]` に新エントリを追加:

```json
{
  "type": "culture",
  "label": "古文常識: <短い見出し>",
  "points": [
    "<60〜120 字>",
    "<60〜120 字>",
    "<本作との関連、60〜120 字>"
  ]
}
```

既存 hints は変更不可。

### 6. MD への逆反映

- A) `### 用語解説` テーブルの該当行を拡充、または新規行追加
- B) `### 古文常識（背景知識）` 節を新設、既存番号の続きで追加（番号体系を破壊しない）
- C) 不要（reading JSON のみ）

### 7. 検証

```bash
# JSON valid
node -e "JSON.parse(require('fs').readFileSync('public/texts-v3/{id}.json','utf8')); JSON.parse(require('fs').readFileSync('public/reading/{id}.json','utf8')); console.log('valid')"

# 古文常識の配置確認
node -e "
const t=require('./public/texts-v3/{id}.json');
const r=require('./public/reading/{id}.json');
const l=t.learningPoints.byLayer.find(b=>b.layer===5);
const cuB=l.points.filter(p=>p.text.startsWith('[古文常識]')).length;
let cuC=0;
for(const a of r.annotations) cuC += a.hints.filter(h=>h.type==='culture').length;
console.log('B:',cuB,'/ C:',cuC);
"
```

### 8. ミラー同期

```bash
cp public/texts-v3/{id}.json dist/texts-v3/{id}.json
cp public/reading/{id}.json dist/reading/{id}.json
```

dist は git 管理外（`.gitignore` 対象）なので git に乗せない。public + src 配下のみコミット。

### 9. コミット

```bash
git add public/texts-v3/{id}.json public/reading/{id}.json
git commit -m "feat: {教材名} 古文常識 (token.hint/layer5/culture hints) 追加 + MD 逆反映"
git push origin main
```

## UI 側のスキーマ要件（既に実装済み）

reading culture hints を表示するために以下が必要（既に main に存在）:

- `src/lib/kobun/types.ts` の `ReadingHintType` に `"culture"` 追加済み
- `src/components/kobun/TokenizedText.tsx` の `hintMeta`/`hintLabel` に culture (🏛️ rose 系、ラベル「古文常識」) 追加済み

新規教材で culture hints を追加するときに UI 側の追加作業は **不要**。

## 並列化のコツ

- 1 教材につき agent 1 体、JSON A) + B) + C) + MD を順次編集
- 並列 5 本程度が安定（rate limit 回避）
- スキル `kobun-token-hints` と並走させない（同一の token.hint を編集する可能性）

## 注意事項

- **既存の layer 5 points を変更しない**。末尾に追加のみ
- **既存 reading hints (subject/grammar/vocab/structure/method) を変更しない**。culture を追加のみ
- **既存 token.hint の内容を上書きしない**。文化背景を追記して合算
- **既存 MD 番号体系を破壊しない**。続き番号で追加のみ
- 解説は **辞書的定義に終わらず本作との関連を必ず示す**
- 重複（既存 overview や読解の要点と被るもの）は省く
- 史実の正確性に注意。不確かな記述は避け、教科書レベルの定説に準拠
- 偏った主観や現代的価値判断（「当時は男尊女卑だった」等）は避ける

## 既存実装からの違い

`kobun-token-hints` がトークン単位の文法・語彙の点的ポイントを扱うのに対し、本スキルは **教材全体に通底する文化的前提**を 3 階層（語/全体/文）に振り分けて整理する。token.hint と本スキルは補完関係にあり、両方そろって初めて読解教材として完備する。
