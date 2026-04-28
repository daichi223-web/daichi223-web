---
name: kobun-canonical-verification
description: kobun-tan 教材の本文 (originalText) を正典・標準校本と照合し、欠落・改変・捏造を検出して修復する作業のスキル。AI 生成由来の要約・意訳・捏造行が混入した教材を、正典本文＋既存 hint/learningPoints 保持の形で校訂する。
triggers:
  - "正典照合"
  - "本文校訂"
  - "本文校正"
  - "正典と比較"
  - "本文を正しく"
  - "原典と照合"
  - "kobun canonical"
  - "校本との差分"
---

# kobun-tan 本文 正典校訂スキル

## 背景

kobun-tan の `public/texts-v3/{id}.json` の `originalText` は、AI 取り込み経路や手作業によって**正典 (校本) から逸脱**しているケースがある。実例:

- **ちごのそらね (`chigo-no-sorane`)**: 「これも今は昔、比叡の山に児ありけり。」(冒頭)・「片方に寄りて、寝たるよしにて、出で来るを待ちけるに…」(中盤)・「（巻第一）」(出典) が欠落。さらに正典に存在しない**捏造セリフ**「『よばれたらば、いらへむ。』と思ひ寝に寝たるに、」が AI により挿入されていた
- **絵仏師良秀 (`31d11bf2f8`)**: 「のつら」(向かいの方角) 欠落、「騒がず。『いかに。』と人言ひければ、」(約 20 字) 欠落、「立ちたまへる」→「おはする」改変、「いでこなむ」(願望) →「また出で来なむ」(完了+推量) への文法的にも間違った改変、結末「にや」(余情) →「にぞ」(強意) の係助詞改変

これらは内部整合性チェック (`fix-token-alignment.cjs` / `rebuild-from-tokens.cjs`) では検出できない**意味論的な本文異変**。本スキルで体系的に正典照合・校訂する。

## スコープ

### 本スキルが扱うもの
- `originalText` と正典本文の一字一句照合
- 欠落部分の復元
- 捏造行の削除
- 改変行の正典への戻し
- 文法再分析が必要な場合の token grammarTag 更新
- 既存 hint, learningPoints, modernTranslation の保持・移行
- 読解ガイド annotation の sentence ID 再マップ

### 本スキルが扱わないもの
- 純粋な構造破損（token と originalText の不整合）→ `kobun-token-alignment-fix` スキル
- 古文常識の追加 → `kobun-cultural-context` スキル
- token hint の単独追加 → `kobun-token-hints` スキル

## 校訂対象とそうでないもの

### 修復すべき差分（**意味に関わる**）
- **欠落**: 正典の文・句・語が現行に無い
- **捏造**: 現行に正典に無い文・句・語が加わっている
- **置換**: 同じ位置で別の語に変わっている (おはする ↔ 立ちたまへる)
- **文法的誤分析**: 同じ仮名表記でも意味が違う場合 (「な」+「む」 完了+推量 vs 「なむ」 終助詞・願望)
- **係助詞・助動詞の置換**: 文意が変わる (にぞ ↔ にや、ば ↔ ど 等)

### 修復しなくてよい差分（**表記・編集方針レベル**）
- 漢字 ↔ 仮名 (出で来 ↔ いでく、煙 ↔ けぶり)
- 異体字 (倉 ↔ 蔵、時々 ↔ ときどき)
- 句読点・スペースの差 (「弓・胡簶」↔「弓、胡簶」)
- 助詞の方向性の軽微な揺れ (大路に ↔ 大路へ)

教科書 (数研出版・東書・三省堂など) はそれぞれ独自の校訂方針を持つため、表記レベルの差分は教科書版に揃えるのが基本。

## 作業フロー

### 1. 正典本文の確認

可能な限り次の優先順位で確認:
1. 学術的校本: 岩波文庫・新編日本古典文学全集 (小学館) など
2. 教科書系 (数研出版『古典探究』, 東京書籍, 大修館 など)
3. 信頼できる Web 校本: コトバンク, 国立国会図書館デジタルコレクション など
4. 自身の知識（最終手段、信頼度に注意）

### 2. 差分の特定

```bash
cd "F:\A2A\apps-released\kobun-tan"
node -e "
const t=require('./public/texts-v3/{id}.json');
const fullText=t.sentences.map(s=>s.originalText).join('');
console.log('---現行本文---');
console.log(fullText);
console.log('length:',fullText.length);
"
```

正典と現行を**手動で一字一句照合**し、差分を一覧化する。差分ごとに「修復する／表記揺れで放置する」を判定。

### 3. 重複ファイルの確認

ちごのそらねの場合、`9f6b6f2e95.json` という別 ID のファイルが正典本文を保持していた。同じ作品の重複ファイルがあれば、それを参照ソースとして使えるか確認:

```bash
node -e "
const idx=require('./src/data/textsIndex.json');
for(const t of idx) if(t.title.includes('TITLE_KEYWORD')) console.log(t.id+'|'+t.title+'|'+t.source_work);
"
```

重複ファイルが正典を保持している場合、その tokens を再利用すると hint/grammar/layer がほぼそのまま使える。

### 4. 修復スクリプトの作成

差分の規模で 2 つのアプローチを使い分ける:

#### A. 軽微な差分 (数箇所): 既存ファイルにピンポイント編集

`scripts/fix-ebusshi-canonical.cjs` 参照。流れ:

1. 既存 sentences を読み込む
2. 編集対象 sentence を特定し、token 配列をピンポイント変更:
   - 文字追加: `s.tokens.splice(idx, 0, ...inserts)` で挿入
   - 文字置換: `s.tokens[idx] = newTk` で差し替え
   - 文字削除: `s.tokens.splice(idx, 1)` で除去
3. 該当 sentence の `originalText` を正典に書き換え
4. token の `start`/`end`/`id` を全 sentence で再採番
5. 検証: 各 sentence で `tokens.text の連結 === originalText`

#### B. 大規模な差分 (本文の半分以上が異なる): 重複ソースから再構築

`scripts/fix-chigo-canonical.cjs` 参照。流れ:

1. 重複ソース (e.g. 9f6b6f2e95) の tokens を取得（正典本文）
2. 新しい sentence 区切りを設計（教育的に妥当な分割で 15 文程度）
3. 既存 hints を **text 単位の queue** で消費して新 tokens に移行
4. 既存 grammarTag が空欄の場合、旧 grammarTag で補完
5. 既存 learningPoints はそのまま継承
6. 検証

### 5. 読解ガイドの更新

sentence ID 数や分割位置が変わったら `public/reading/{id}.json` の annotations も更新:

1. 旧 sentence ID → 新 sentence ID のマッピング表を作成
2. 無効になった annotation (e.g. 削除された捏造文) は drop
3. 新規追加された sentence (e.g. 復元された欠落文) には新 annotation を執筆
4. 改変の影響を受けた annotation は guide 文 / hints の内容を改訂

`scripts/fix-chigo-reading.cjs` / `scripts/fix-ebusshi-reading.cjs` 参照。

### 6. ミラー同期

```bash
cp public/texts-v3/{id}.json dist/texts-v3/{id}.json
cp public/reading/{id}.json dist/reading/{id}.json
```

### 7. 検証コマンド

```bash
node -e "
const t=require('./public/texts-v3/{id}.json');
const r=require('./public/reading/{id}.json');
console.log('text sentences:',t.sentences.length);
console.log('text tokens:',t.sentences.flatMap(s=>s.tokens).length);
console.log('text hints:',t.sentences.flatMap(s=>s.tokens).filter(tk=>tk.hint).length);
console.log('reading annotations:',r.annotations.length);
console.log('annotation IDs:',r.annotations.map(a=>a.sentenceId).join(','));
console.log('text IDs      :',t.sentences.map(s=>s.id).join(','));
let ok=true;
for(const s of t.sentences){
  const concat=s.tokens.map(tk=>tk.text).join('');
  if(concat!==s.originalText){ok=false;console.log('MISMATCH '+s.id)}
}
console.log('alignment ok:',ok);
"
```

すべて整合し、annotation IDs と text IDs が完全一致することを確認。

## NotebookLM MD への逆反映

本スキルで本文を変更したら NotebookLM Vault `F:\A2A\NotebookLM\kokugo-vault\30-教材\古文\<分類>\<title>.md` の本文セクションも同期更新する:

- `## 1. 本文` セクションを正典本文に書き換え
- `## 2. 品詞分解` テーブルも token 構造に合わせて更新
- `## 3. 現代語訳` も新 sentence 単位で再執筆

## 文法再分析の注意

正典に戻す際、同じ仮名表記でも文法構造が変わる場合がある:

| 表記 | 誤った分析 | 正しい分析 |
|---|---|---|
| いでこなむ | 出で来 (連用) + な (完了「ぬ」未然) + む (推量) | 出で来 (未然) + なむ (終助詞・願望) |
| にや | 格助詞「に」+ 係助詞「や」 | 断定「なり」連用形「に」+ 係助詞「や」(余情) |
| たまへる | 単独動詞 | たまふ (已然) + り (存続「り」連体) |
| こそあれ | こそ + あれ | こそ (係助詞) … 已然「あれ」(係結) |

token の `grammarTag` を `pos / conjugationType / conjugationForm / baseForm / meaning / honorific` フィールドで適切に再設定する。

## hint と learningPoints の保持

修復作業で重要なのは「教材として磨かれた既存資産を失わないこと」:

- **hint (token レベルの解説)**: text + grammarTag の組み合わせで queue 消費するか、approximate position で対応付ける
- **learningPoints (overview / byLayer)**: 文構造の改訂と直接関係しないので原則そのまま継承
- **modernTranslation (現代語訳)**: sentence 構造を変えた場合は新 sentence 単位で書き直しが必要 (ただし元訳の表現を活かす)

## チェックリスト (新規教材を校訂する前に)

- [ ] 正典本文を確認した (校本・教科書・Web 校本)
- [ ] 同じ作品の重複ファイル (別 ID) があるか確認した
- [ ] 差分一覧を作成し、修復／放置の判定をした
- [ ] 差分の規模 (A: ピンポイント / B: 再構築) を判断した
- [ ] 修復スクリプトを書いた
- [ ] 読解ガイドの annotation 再マップを書いた
- [ ] 検証コマンドで全項目 OK を確認した
- [ ] dist/ ミラーを同期した
- [ ] NotebookLM MD の本文・品詞分解・現代語訳を同期した
- [ ] git に別コミットでまとめた

## コミットメッセージ例

```
fix: <教材名> 正典本文への修正

<出典 (例: 宇治拾遺物語 巻第三第六話)> の正典と照合し、本文の欠落・改変を修復:
- s5: 「<旧>」→「<新>」(<理由>)
- s7+s8: <旧文> を分割して <新s7> + 新s8 <新文> へ正典本文に合わせて欠落復元
- s11: 「<旧>」→「<新>」
- ...

<旧文数>/<旧token数> → <新文数>/<新token数>、hint <旧>件→<新>件。
読解ガイドも sentence ID 再マップ + 改訂内容反映 + 新s8 annotation 追加。
```

## 参考実装

- `scripts/fix-chigo-canonical.cjs` (再構築型 — 重複ソースから本文ごと作り直し)
- `scripts/fix-chigo-reading.cjs` (sentence ID 再マップ + 新規 annotation 追加)
- `scripts/fix-ebusshi-canonical.cjs` (ピンポイント編集型 — 5 箇所のみ修正)
- `scripts/fix-ebusshi-reading.cjs` (sentence ID 再マップ + 改訂反映)

## 既知の校訂例 (参考)

| 教材 | 修復タイプ | 主な修復内容 |
|---|---|---|
| ちごのそらね | B (再構築) | 11 文 → 15 文、捏造行削除、欠落 5 箇所復元 |
| 絵仏師良秀 | A (ピンポイント) | 「のつら」復元・「騒がず」復元・「立ちたまへる」復元・「いでこなむ」再分析・「にや」復元 |
| 芥川 | 不要 (表記差のみ) | 倉/蔵、ゆく/行く 等の表記揺れのみで本文は正典どおり |

## 並列化のコツ

複数教材を一度に校訂する場合、教材ごとに 1 エージェントを立てるのが安定。1 教材の校訂で正典本文の確認・差分判定・スクリプト作成・検証まで含めて 30〜60 分かかるため、並列 3〜5 件が適切。
