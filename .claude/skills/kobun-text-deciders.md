---
name: kobun-text-deciders
description: kobun-tan 読解教材の各助動詞に「意味の決め手」(なぜその意味に決まるか＝型＋理由＋本文中の手がかり)を、助動詞例文集(grammar_reibun)と同じモデルで付与・点検し、名指しの教材を手書き gold に上げるスキル。analysis/<id>.json の decider 層を生成し、GrammarPopover に文例集と同じ視覚言語(DECIDER_STYLE/ReibunSentence)で表示する。6教材(東下り3＋芥川＋絵仏師良秀＋児のそら寝)は手書き gold、他は engine 自動生成(全3996 decider)。2026-06 にユーザー(高校国語教師)の依頼で確立。「○○も(gold化して)」と言われたら §5 の runbook で1教材ずつ上げる。
triggers:
  - "意味の決め手"
  - "決め手"
  - "助動詞 解説"
  - "文例集と同様"
  - "どう決まる"
  - "decider"
  - "助動詞 gold"
  - "gold 化"
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
node scripts/build-text-deciders.mjs --force     # 既存 decider を再生成(GOLD は常に保護)
```
- `GOLD`(`build-text-deciders.mjs` 冒頭の `new Set([...])`)＝手書き gold 教材。`--force` でも触らない。現在＝東下り3本(e245dd3617/bfa5b23cf2/1af601c3ea)＋芥川(3d0d7bf6ee)＋絵仏師良秀(31d11bf2f8)＋児のそら寝(chigo-no-sorane)。**手書き gold を1教材足したら必ずこの集合に id を追加する**。
- 既存 `reasoning`(判別の筋道、chigo-no-sorane 等)は保持してマージする。
- 何も生成しない教材(全 token が既に decider 持ち)はファイルを書き換えない。

## 4. 検証(生成後に必ず)

`['後接','呼応','形','主語','文脈']` 以外の型なし／cue.text が本文の部分文字列／**cue.text の出現が文中1回のみ**(誤ハイライト防止)／DeciderPanel の【】はトークン `start,end` で本文を切るので `originalText.slice(start,end)===token.text` であること、を確認する。実績ワンライナーは会話ログ参照。基準値：全105教材で deciders=3996 / cues≈4244 / substring=0 ambiguous=0 badType=0 emptyCue=0。

## 5. gold 化 runbook(「○○も(gold化して)」と言われたら)

名指しの教材を東下り並みの手書き gold に上げる定型手順。engine は既存 decider を保持するので、手書きで decider を書けば gold として固定される。

1. **id 特定**：`public/texts-v3/index.json` を title で検索(例 芥川→`3d0d7bf6ee`／絵仏師良秀→`31d11bf2f8`／児のそら寝→`chigo-no-sorane`)。
2. **助動詞 dump**：`extractJodoshi(loadText(id))`(`scripts/text-deciders.lib.mjs`)を tmp に JSON で書いて Read。前接/後接/係助詞/活用形つきで全助動詞が出る。**8GB機なので逐次・画像Readなし**([[machine-specs-low-ram]])。
3. **執筆**：token ごとに `{meaning(教材値を維持), type, summary, cues}`。
   - summary＝判定の筋道を一言(接続・人称・文脈)。例「直前『至り』は連用形。連用形＋ぬ＝完了。打消ずは未然形接続なので接続で識別」。
   - cues＝前接(形)／係助詞・疑問語・呼応副詞(呼応)／後接(後接)／主語(主語・語なし可)／地の文・和歌(文脈・語なし)。**多出語(に・と・し・ば・む等)は cue.text に使わない**。
4. **適用**：`scripts/_apply-gold-deciders.mjs` 型の**一回スクリプト**に `textId→tokenId→decider` を埋め込み、(a)token存在・型・summary長、(b)cue.text が本文の部分文字列、(c)**cue.text の出現が文中1回のみ**、を検証してから**既存 reasoning を保持してマージ書込み**。検証エラーが出たら書込み中止 → その cue を語なし(`text:""`)か別の一意語に直して再実行。
5. **GOLD 保護**：`build-text-deciders.mjs` の `GOLD` 集合に id を追加(§3)。これで `--force` でも上書きされない。
6. **全体検証(§4) → `npm run build`(public→dist) → commit/push**(author=daichi223@gmail.com、無関係な作業中変更は混ぜない。`public/analysis/<id>.json`＋必要なら scripts/GrammarPopover のみ stage)。
- 手本＝`public/analysis/{e245dd3617,bfa5b23cf2,1af601c3ea,3d0d7bf6ee,31d11bf2f8,chigo-no-sorane}.json`。型・cue・summary の書き方の基準。
- **新規教材ではオフセット確認**：DeciderPanel の【判定語】は token `start,end` で originalText を切る。一部教材(例 `ff4fa387b4`)は start/end が文単位でなく文書全体基準でズレ `slice` が空になる。GrammarPopover は `onlyOnce`(表層が文中1回出現時のみ置換ハイライト／複数出現は太字なし)でフォールバックするので誤太字はしないが、`originalText.slice(start,end)===token.text` を確認しておくと【】が正しく付く。

## 5b. ラベルが疑わしいときの作法(重要)

decider 作成中に **texts-v3 の meaning ラベル自体の誤り**に気づくことがある。decider は意味を変えない原則(捏造禁止)なので：
- **明白な誤り**は gold 化せず engine 自動のまま残し、**ユーザー(教師)に報告**して [[kobun-jodoshi-meaning-label]] の手順で直すか確認する。誤ラベルを手書き gold で塗り固めない。
  - 実例：児のそら寝 s8-t10「おどろか**せ**たまへ」＝せ＋たまへの二重尊敬なのに meaning=使役 → gold化せず残置・報告(2026-06-23)。
- **微妙な差**は meaning を維持しつつ summary で正しく説明する。
  - 実例：児のそら寝 s4-t4/s4-t10 連体形む(し出ださむを/寝ざらむも)＝婉曲が妥当だが meaning=推量 → meaning維持・summaryで「連体形のむ＝婉曲」と明記。

## 6. 表示・スキーマの場所
- 型：`src/lib/kobun/types.ts` … `TokenAnalysis.decider?: TokenDecider`、`TokenDecider`、`DeciderType`/`DeciderCue`(既存・例文集と共有)。
- 描画：`src/components/kobun/GrammarPopover.tsx` の `DeciderPanel`(末尾)。`!isScaffold && analysis?.decider` のとき表示＝**助動詞レイヤー(2)以上で開く**。
- 視覚言語の流用元：`src/components/grammar/ReibunSentence.tsx`(`DECIDER_STYLE`・`ReibunSentence`)。
- `public/` が本番ソース、`dist/` はビルド成果物(`npm run build` で analysis をコピー、Vercel は public からビルド)。両方を整合させる。

## 実績(2026-06-23)
- 手書き gold 6教材＝東下り3本(58)＋芥川(23)＋絵仏師良秀(35)＋児のそら寝(28＋既存reasoning15保持)。他は engine 自動生成。全104ファイル・3996 decider・cues 4284、検証 substring/ambiguous/badType/emptyCue=0(offset 不一致は ff4fa387b4 のみで `onlyOnce` 対応)。
- スキーマ(`TokenDecider`)＋`DeciderPanel` 追加、`reasoning` を任意化。`npm run build` 成功(既存 tsc strict エラーは別ファイルの既存分のみ)。
- commit: `657617b`(全教材+infra) / `ae70f62`(芥川・絵仏師・児のそら寝 gold)。

## 関連
- [[kobun-reibun-corpus-progress]]／`/kobun-reibun-corpus`(決め手モデルの本家＝助動詞例文集)。
- [[kobun-jodoshi-meaning-label]](意味ラベルの判別・是正＝decider の前提)。
- [[kobun-tan-kyozai-data-layers]](texts-v3/reading/analysis/vault の並行層構成)。
- [[kobun-tsu-nu-kakujutsu]]／`/kobun-tsu-nu-kakujutsu`(つ・ぬ 強意(確述)/完了の識別。decider の強意・完了で注意)。
