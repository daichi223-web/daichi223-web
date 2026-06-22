---
name: kobun-text-deciders
description: kobun-tan 読解教材の各助動詞に「意味の決め手」(なぜその意味に決まるか＝型＋理由＋本文中の手がかり)を、助動詞例文集(grammar_reibun)と同じモデルで付与・点検するスキル。analysis/<id>.json の decider 層を生成し、GrammarPopover に文例集と同じ視覚言語(DECIDER_STYLE/ReibunSentence)で表示する。東下り3本は手書き gold、他104教材は engine 自動生成。2026-06 にユーザー(高校国語教師)の依頼で確立。
triggers:
  - "意味の決め手"
  - "決め手"
  - "助動詞 解説"
  - "文例集と同様"
  - "どう決まる"
  - "decider"
  - "東下り 助動詞"
  - "意味の決定"
  - "判別 教材"
---

# kobun-tan 教材の「意味の決め手」(助動詞 decider)

読解教材(texts-v3)の各助動詞について、**確定済みの意味がなぜそう決まるのか**を、
助動詞例文集(`grammar_reibun`)とまったく同じ「決め手」モデルで本文に重ねて解説する。

## 0. 全体像(データの流れ)

```
public/texts-v3/<id>.json   助動詞 token に grammarTag.meaning(確定済み)＋hint
        │  scripts/build-text-deciders.mjs(＋text-deciders.lib.mjs)
        ▼
public/analysis/<id>.json   tokenAnalyses[].decider = { meaning, type, summary, cues }
        │  TextReader が /analysis/<id>.json を遅延 fetch → TokenizedText → GrammarPopover
        ▼
GrammarPopover の「🔑 意味の決め手」パネル(DeciderPanel)
   ＝ 例文集と同じ DECIDER_STYLE(型→色) ＋ ReibunSentence(本文を【判定語】＋色つき手がかり下線)
```

- **意味(meaning)は教材が確定済み。decider は "なぜその意味か" を説明するだけで、意味は変えない(捏造禁止)。**
- decider の語彙・色・下線は例文集と共有 → 「文例集と同様に解説される」が UI レベルで実現する。

## 1. 決め手モデル(例文集と共有)

`type` = **決め手の型**(`src/lib/kobun/types.ts` の `DeciderType`、色は `ReibunSentence.tsx` の `DECIDER_STYLE`):

| 型 | 色/線 | いつ |
|----|------|------|
| 後接 | 赤/実線 | 下に来る語で決まる(つ＋べし→強意、す＋給ふ→尊敬) |
| 呼応 | 橙/点線 | 係助詞・疑問語・呼応副詞・打消・反実の「ましかば〜まし」 |
| 形 | 青/二重線 | 活用形・接続・語形(連用形＋ぬ＝完了、体言＋なり＝断定、連体形＋体言＝婉曲) |
| 主語 | 緑/実線 | 主語の人称(一人称→意志/打消意志、三人称→推量、貴人→尊敬) |
| 文脈 | 紫/破線 | 地の文/会話/和歌・場面(地の文けり＝過去、和歌結句けり＝詠嘆、存続/受身/使役/自発) |

`TokenDecider = { meaning, type, summary, cues }`:
- `summary`：なぜその意味になるかの説明文(例文集 `reibun.decider` 相当)。
- `cues: DeciderCue[]`：本文中の手がかり。`{ text, type, note }`。
  - **`text` は本文(originalText)の部分文字列**であること。
  - **`text` は文中に1回しか出ない語にする**(ReibunSentence は一致箇所を**すべて**ハイライトするので、複数出現する「に」「と」「し」「ば」等は誤ハイライトになる)。曖昧なら語を消して `text:""`(型チップだけ)にする。
  - `type` は手がかりごとに付けてよい(べき＝文脈だが、下の体言「国」は形の手がかり、のように混在可)。

## 2. 型の割り当て(意味→型)

engine の `TYPE_BY_MEANING`(`scripts/build-text-deciders.mjs`)が正典。要点:
- 過去/詠嘆/存続/受身/使役/自発/当然/適当/現在推量/過去伝聞＝**文脈**。
- 完了/断定/存在/打消/婉曲/仮定/比況/過去推量/推定(なり)/伝聞/希望＝**形**(接続・活用形)。
- 意志/推量/打消推量/打消意志/尊敬(る・らる)＝**主語**(人称)。
- 強意/尊敬(す・さす・しむ＝二重敬語)＝**後接**。
- 可能/原因推量/反実仮想/不可能＝**呼応**。
- 例外：推定/伝聞でも `めり` は **文脈**(視覚)。

判別の文法ルール本体は [[kobun-jodoshi-meaning-label]](けり過去/詠嘆、らむ現在/原因推量)を参照。意味ラベル自体が疑わしいときは**まずそちらで意味を是正**してから decider を作る。

## 3. engine の使い方(8GB機・Workflow不使用・逐次)

`scripts/text-deciders.lib.mjs`(抽出)＋`scripts/build-text-deciders.mjs`(生成)。純変換なので並列エージェント不要・落ちない([[workflow-crashes-low-ram]])。

```
node scripts/build-text-deciders.mjs            # 全教材。既存 decider は保持(東下り gold 等)
node scripts/build-text-deciders.mjs <id> ...   # 指定教材のみ
node scripts/build-text-deciders.mjs --dry <id> # 標準出力に出すだけ(書込まない)。レビュー用
node scripts/build-text-deciders.mjs --force     # 既存 decider を再生成(GOLD=東下り3本は常に保護)
```
- `GOLD = {e245dd3617, bfa5b23cf2, 1af601c3ea}`(東下り八橋/宇津の山/都鳥)＝手書き gold、`--force` でも触らない。
- 既存 `reasoning`(判別の筋道、chigo-no-sorane 等)は保持してマージする。
- 何も生成しない教材(全 token が既に decider 持ち)はファイルを書き換えない。

## 4. 検証(生成後に必ず)

`['後接','呼応','形','主語','文脈']` 以外の型なし／cue.text が本文の部分文字列／**cue.text の出現が文中1回のみ**(誤ハイライト防止)／DeciderPanel の【】はトークン `start,end` で本文を切るので `originalText.slice(start,end)===token.text` であること、を確認する。実績ワンライナーは会話ログ参照。基準値：全105教材で deciders=3996 / cues≈4244 / substring=0 ambiguous=0 badType=0 emptyCue=0。

## 5. gold authoring(1教材を東下り並みに手書きで上げる)

engine は既存 decider を保持するので、**手書きで `analysis/<id>.json` の該当 token の decider を書けば gold 扱いで固定**される。手順:
1. `extractJodoshi(loadText(id))` で助動詞 token を文脈ごと dump(`scripts/text-deciders.lib.mjs`)。
2. token ごとに `{meaning(教材の値を維持), type, summary, cues}` を執筆。
   - summary は接続・人称・文脈の**判定の筋道**を一言で(例：「直前『至り』は連用形。連用形＋ぬ＝完了。打消ずは未然形接続なので接続で識別」)。
   - cues は前接(形)・係助詞/疑問語(呼応)・後接(後接)・主語(主語・語なし可)・地の文/和歌(文脈・語なし)。**多出語は使わない**。
3. §4 の検証 → `npm run build`(public→dist コピー)。
- 東下りの実例＝`public/analysis/{e245dd3617,bfa5b23cf2,1af601c3ea}.json`(58 decider)。型・cue の書き方の手本。

## 6. 表示・スキーマの場所
- 型：`src/lib/kobun/types.ts` … `TokenAnalysis.decider?: TokenDecider`、`TokenDecider`、`DeciderType`/`DeciderCue`(既存・例文集と共有)。
- 描画：`src/components/kobun/GrammarPopover.tsx` の `DeciderPanel`(末尾)。`!isScaffold && analysis?.decider` のとき表示＝**助動詞レイヤー(2)以上で開く**。
- 視覚言語の流用元：`src/components/grammar/ReibunSentence.tsx`(`DECIDER_STYLE`・`ReibunSentence`)。
- `public/` が本番ソース、`dist/` はビルド成果物(`npm run build` で analysis をコピー、Vercel は public からビルド)。両方を整合させる。

## 実績(2026-06-23)
- 東下り3本＝手書き gold(58 decider、§5 の手本)。他104教材＝engine 自動生成(3938 decider)。計 3996。
- スキーマ(`TokenDecider`)＋`DeciderPanel` 追加、`reasoning` を任意化。`npm run build` 成功(既存 tsc strict エラーは別ファイルの既存分のみ)。

## 関連
- [[kobun-reibun-corpus-progress]]／`/kobun-reibun-corpus`(決め手モデルの本家＝助動詞例文集)。
- [[kobun-jodoshi-meaning-label]](意味ラベルの判別・是正＝decider の前提)。
- [[kobun-tan-kyozai-data-layers]](texts-v3/reading/analysis/vault の並行層構成)。
- [[kobun-tsu-nu-kakujutsu]]／`/kobun-tsu-nu-kakujutsu`(つ・ぬ 強意(確述)/完了の識別。decider の強意・完了で注意)。
