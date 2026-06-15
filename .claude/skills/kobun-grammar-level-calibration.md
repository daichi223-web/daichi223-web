---
name: kobun-grammar-level-calibration
description: kobun-tan 文法道場ドリルの難易度レベル（sort の百の位＝Lv1〜5）を「べし」基準で再調整するスキル。各トピック内を「基礎暗記→文中活用形→識別/短文脈の意味→入試本文の意味」の階段状に整える。本文なしの知識問題をLv1へ、本文ありの識別・意味を難易度順にLv2〜L4へ再バンドする。scripts/relevel-grammar.py が中核。
triggers:
  - "レベル"
  - "レベル感"
  - "難易度"
  - "再レベル"
  - "level calibration"
  - "ドリル レベル"
  - "sort 調整"
  - "レベル 整える"
---

# kobun-tan 文法道場 レベル再調整スキル（べし基準）

## レベルの仕組み

`src/lib/kobun/dojoData.ts` の `drillLevel(d) = min(5, floor(sort/100)+1)`。
**ドリルの難易度は `sort` の百の位だけで決まる。**

| sort | レベル |
|---|---|
| 1–99 | Lv1（基礎） |
| 100台 | Lv2（活用） |
| 200台 | Lv3（識別・短文脈の意味） |
| 300台 | Lv4（入試本文の意味） |
| 400台 | Lv5（難関） |

## 基準＝「べし」(jodoshi-beshi) の設計思想

| Lv | 中身 | kind の目安 |
|---|---|---|
| **Lv1** | 接続・活用型・語呂・代表的意味（**本文なしの知識確認**） | setsuzoku / katsuyo-type / 本文なしの imi・shikibetsu |
| **Lv2** | 文中で活用形を答える | katsuyo-fill（本文あり） |
| **Lv3** | 識別（本文あり）・短文脈の意味 | shikibetsu（本文あり）/ imi 短め |
| **Lv4** | 入試級の本文で意味判定 | imi（本文あり・長め） |

べしの分布 ≒ 5 / 16 / 13 / 15（10% / 33% / 27% / 31%）。

## よくある不整合（2026-06-15 検出）

- `jodoshi-nu`：**本文識別が Lv1/2 に集中して難しすぎ**（Lv1に「完了ぬvs打消ず」「ぬる/ぬれ」識別が大量）。
- `jodoshi-mu`・`keiyoshi-*`：**Lv1 が0問**（基礎知識問題が無い、または全問本文あり）。
- `shikibetsu-*`（識別クラスター）：Lv1→Lv4 に飛んで **Lv2/Lv3 が空**。

## 方式（scripts/relevel-grammar.py）

**全トピックを同型に強制しない。** トピックごとに：

1. **本文なしの知識問題** → Lv1 確定（接続・活用型・語呂・見分け方・代表的意味）。
2. **本文ありの応用問題** を難易度スコアで昇順整列：
   - スコア = kind段階（活用形 < 本文識別 < 本文意味）を主、作問者の旧 sort を従。
   - → 同種ばかりのトピック（助詞＝識別、形容詞＝活用）でも、作問者の既存
     グラデーションを保ったまま Lv2/3/4 へ階段状に分かれる。
3. Lv1 が全体の 10% 未満なら、応用の最易問題を Lv1 に繰り上げ（mu 等の救済）。
4. **動詞・形容詞**トピックは天井を Lv3 に（活用中心で「入試意味」帯がないため L4→L3）。
5. 各レベル内は (旧sort, id) で安定採番（`sort = (level-1)*100 + 連番`）。

検証ポイント：再調整後も **基準のべしはほぼ不動**（5/16/13/15 → 5/17/13/14）であること。
大きく動くなら鵜呑みにせず原因を確認。

## 手順

```
python scripts/relevel-grammar.py             # ドライラン（scripts/relevel-report.txt に before/after 分布）
# 分布を点検（⚠L1空 が無いか、識別が Lv1 に残っていないか、べしが不動か）
cp supabase/seeds/*.json scripts/seed-backup-<date>/   # git管理外なので必ず backup
python scripts/relevel-grammar.py --apply      # seed 書き換え（sort のみ変更）
python -c "import json,glob; [json.load(open(f,encoding='utf-8')) for f in glob.glob('supabase/seeds/*.json')]"  # JSON妥当性
python scripts/check-grammar-quiz.py           # 係り結び等の再監査（flagged=0 を確認）
```

## DB 反映（本番・要確認）

```
node --env-file=.env.local scripts/apply-drills.mjs supabase/seeds/<file>.json --merge
```
`--merge` で id 単位 upsert。**外向き操作なので実行前に必ず確認。** 複数ファイルに
またがるトピック（例 jodoshi-nu は4ファイル）は、関係ファイルすべてを反映すること。

## 限界（レベル調整では直らないもの）

- Lv1 用の基礎問題が**そもそも存在しない**トピックは、繰り上げで代用しても薄い。
  本来は接続・活用・語呂の問題を**新規作問**すべき（別タスク）。
- kind が単一のトピック（純活用・純識別）は、べしのような4種バランスにはならない。

## 関連スキル

- [[kobun-grammar-quiz-kakari-check]] … 係り結びの手がかり・説明の検査
- [[kobun-conjugation-form-check]] … texts-v3 token の活用形タグ検査
