# B2 用例 sense 紐付け — エージェント作業手順書

kobun-tan の用例バンク（public/example-bank/）の未紐付け用例に、kobunQ の意味(qid)を判定して付ける作業。
1バッチ=80件。**必ず1バッチずつ逐次**（並列禁止・8GB機）。

## 1バッチの手順（この順に実行）

```powershell
# 1) 抽出（判定済みは自動スキップされるので常にこのまま実行）
$env:PYTHONIOENCODING='utf-8'
& "C:\Users\a713678\AppData\Local\Python\pythoncore-3.14-64\python.exe" F:\A2A\tmp\dump_bind.py
```

2) `F:\A2A\tmp\bind_batch.txt` を Read で精読する。
   形式: `=== lemma` の下に `[qid] 意味 (手がかり)` の一覧、続いて `#n 例文`（label: は辞書由来の参考ラベル）。

3) 全 #n に verdict を判定し、`F:\A2A\tmp\bind_answers.json` に **JSON配列**（#0 から順に、件数ぴったり）を Write する。
   verdict の値:
   - `"<qid>"`（例 "23-1"）… その意味に紐付け
   - `"unknown"` … 同じ語だが kobunQ に立っていない意味（例: しのぶ〔偲ぶ=追慕〕、かなし〔悲哀〕、なほ〔さらに/そのまま〕、あふ〔会う一般〕）
   - `"reject"` … 別語の誤混入（例: 飽く に「開く」、とく に「解く/説く」、しか(副詞) に過去助動詞き已然形「〜しか」、おぼえ(名詞) に動詞おぼゆ、かづく に「潜く」）

```powershell
# 4) 反映（NNN は3桁連番。既存の bind-*.jsonl の次の番号を使う）
& "C:\Users\a713678\AppData\Local\Python\pythoncore-3.14-64\python.exe" F:\A2A\tmp\merge_bind.py F:\A2A\apps-released\kobun-tan\data\enrich\bind-NNN.jsonl
& "C:\Users\a713678\AppData\Local\Python\pythoncore-3.14-64\python.exe" F:\A2A\apps-released\kobun-tan\scripts\build-example-bank.py
```

5) build-example-bank の出力（unbound / b2: bound / reject）を記録して次のバッチへ。

## 判定方針

- **[qid] 横の（手がかり）が判定基準**。文脈の共起語で決める。迷ったら unknown（誤紐付けより保留が良い）
- 敬語動詞は「本動詞/補助動詞」「対象（衣服・飲食・乗り物なら尊敬に転じる）」で分ける
- 呼応の副詞は文末（打消・禁止・推量・願望）を必ず確認
- 助動詞・助詞・別動詞の誤混入（baseFormの誤り）は迷わず reject
- 和歌の掛詞・地名・慣用句化したもの（しのぶずり等）は unknown

## 終了条件・報告

- 指定されたバッチ数を終えたら、最終行の `sense unbound: N` と各バッチの bound/reject/unknown 概数を報告する
- dump の `total unbound (non-heavy)` が 0 になったら「非超頻出 完了」と報告して停止する
- スクリプトのエラーや件数不一致（merge の assert）が出たら、無理に直さずその場で停止して状況を報告する
