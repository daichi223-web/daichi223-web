---
name: kobun-token-alignment-fix
description: kobun-tan の texts-v3/{id}.json で「sentence.tokens の連結が sentence.originalText と一致しない」「token.start/end が token.text 位置と一致しない」構造破損を検出・修復するスキル。grammarTag/hint/layer など意味データは保持したまま、文への所属と start/end のみ再計算する。
triggers:
  - "token alignment"
  - "トークン整合性"
  - "start/end ズレ"
  - "tokens 修復"
  - "token 構造"
  - "sentence boundary 修復"
---

# kobun-tan トークン整合性修復スキル

## 問題パターン

texts-v3 JSON は本来こうあるべき:
- `s.tokens.map(tk=>tk.text).join('')` === `s.originalText`
- `s.originalText.slice(tk.start, tk.end)` === `tk.text`

ところが多くの教材で次の構造破損が発生している:
1. **トークンが隣接文に紛れ込む**: 文末の助動詞や句点が次の文の冒頭トークンとして配置されている
2. **トークンが文境界を跨ぐ**: 「。家」「、火」のように句読点と次文の最初の字が連結された malformed token がある
3. **start/end が token.text 位置と齟齬**: 連結すれば原文と一致しても、各 token の start/end は実際の位置を指していない
4. **末尾欠損**: 「（巻第三）」のような出典表記など、originalText にあるが tokens にない

実例:
- `絵仏師良秀` (31d11bf2f8): 全 21 文で連結ミスマッチ。「。家」「、火」「、ときどき」等の連結トークン多数
- `芥川` (3d0d7bf6ee): 全 11 文でミスマッチ。s1 に偽の「、」混入、s11 末尾「（第六段）」欠損
- `ちごのそらね` (chigo-no-sorane): 連結は正しいが s8 以降で start/end ズレ 16 件

スキャンの結果、**107 教材中 103 教材**でいずれかの問題を確認 (2026-04-28 時点)。

## 検出スクリプト

```bash
cd "F:\A2A\apps-released\kobun-tan"
node -e "
const fs=require('fs');
const path=require('path');
const dir='./public/texts-v3';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
const problems=[];
for(const f of files){
  try{
    const t=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
    if(!t.sentences) continue;
    let concatMismatch=false;
    let startEndMismatch=0;
    for(const s of t.sentences){
      const concat=s.tokens.map(tk=>tk.text).join('');
      if(concat!==s.originalText)concatMismatch=true;
      for(const tk of s.tokens){
        if(s.originalText.slice(tk.start,tk.end)!==tk.text)startEndMismatch++;
      }
    }
    if(concatMismatch||startEndMismatch>0){
      problems.push({id:t.id,title:t.title,concatMismatch,startEndMismatch});
    }
  }catch(e){console.log('ERROR '+f+' '+e.message)}
}
console.log('Texts with structural issues:',problems.length);
for(const p of problems) console.log('  '+p.id+' | '+p.title+' | concat='+p.concatMismatch+' | startEnd='+p.startEndMismatch);
"
```

## 修復スクリプト

`scripts/fix-token-alignment.cjs` が用意されている。ロジック:
1. 全トークンを順序通り取得
2. 各トークンの累積位置 (charPos) を計算
3. 文境界 (各 sentence の originalText 累積長) を計算
4. 累積位置から各トークンが属する文を判定
5. 文境界を跨ぐトークンは text を分割し両方の文に配分（grammarTag/hint/layer は両方に複製）
6. 末尾未充足の文には埋めトークン (layer=0) を生成
7. 各文内で id を `{sentId}-t{n}` に振り直し、start/end を再計算
8. 最終検証で全文 `concat===originalText` かつ `slice(start,end)===text` を確認

### 使い方

```bash
cd "F:\A2A\apps-released\kobun-tan"
node scripts/fix-token-alignment.cjs <textId>
# 例: node scripts/fix-token-alignment.cjs 31d11bf2f8
```

成功時は `public/texts-v3/{id}.json` と `dist/texts-v3/{id}.json` が上書きされる (dist が無ければ public のみ)。検証失敗時は書き込まれず exit 1。

### 限界（pre-fix が必要な場合）

スクリプトは「全 token text の連結 ≒ 全 originalText の連結」を仮定する。中間に**実際の文字差分**があると累積誤差が広がり修復不能。次のケースでは事前手動修正 (pre-fix) が必要:

- **偽の文字が token に混入**: 例: 芥川 s1-t2「男、」が原文「男」のはずなのに「、」が混入。手動で `token.text` を「男」に直してから fix を走らせる
- **末尾欠損**: 例: 芥川の「（第六段）」が tokens 側で「。」に置き換わっていた。最後の token の text を実際の原文末尾に直す
- **本文の改稿**: 教材本文 (originalText) 自体が改訂されたが tokens 側が旧版のまま。差分を解消してから fix

### Pre-fix の指針

```bash
# 全文と全トークン連結を比較して最初の差異を特定
node -e "
const t=require('./public/texts-v3/{id}.json');
const allOrig=t.sentences.map(s=>s.originalText).join('');
const allTok=t.sentences.flatMap(s=>s.tokens).map(tk=>tk.text).join('');
for(let i=0;i<Math.min(allOrig.length,allTok.length);i++){
  if(allOrig[i]!==allTok[i]){
    console.log('first diff at',i);
    console.log('orig:',allOrig.slice(Math.max(0,i-10),i+30));
    console.log('tok :',allTok.slice(Math.max(0,i-10),i+30));
    break;
  }
}
console.log('lengths orig='+allOrig.length+' tok='+allTok.length);
"
```

差異箇所の前後を見て、token.text の手動修正で齟齬を解消してから fix を走らせる。

## 文法ラベル誤りの修正

構造修復とは別に、grammarTag.meaning に学校文法的に不正確なラベルが混入している教材がある。代表的な誤りパターン:

| パターン | 誤 | 正 |
|---|---|---|
| けり（地の文） | `過去（伝聞）` | `過去`（または「詠嘆」、文末発見・気づきの場合） |
| 連体形「む」 | `推量` | `婉曲`（または「仮定」） |
| 「に」助詞の用法 | `回数` | `手段` |
| 終助詞「かし」 | `願望` | `念押し` |
| 「おどろかせたまふ」の「せ」 | `使役` | 両論あり (尊敬と取る説が定説の場合多い) |

学校文法に揃える小修正をスクリプト or 手動で行う。

## 報告 / コミットメッセージ

修復後コミットメッセージ例:
```
fix: トークン整合性修復 — {教材名} ({textId})

- sentence.tokens の連結を originalText と一致させる
- start/end インデックスを再計算
- grammarTag/hint/layer 等は保持
- 跨りトークンは分割、末尾欠損はフィラーで補填
```

## 影響を受けないもの

- learningPoints / reading guide / その他メタ情報は触らない
- src/data/textsIndex.json / textsV3Index.json も触らない（sentence・token 数は内部参照のみ）
- token の grammarTag / hint / grammarRefId / layer は保持

## バッチ修復

複数教材を一括修復する場合:

```bash
cd "F:\A2A\apps-released\kobun-tan"
for id in $(ls public/texts-v3/*.json | xargs -n1 basename | sed 's/.json$//'); do
  node scripts/fix-token-alignment.cjs "$id" 2>&1 | grep -E "Fixed|MISMATCH" | head -2
done
```

ただし pre-fix が必要な教材は失敗するので、失敗ログを別途精査する。
