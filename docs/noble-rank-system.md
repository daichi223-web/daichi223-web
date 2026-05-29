# 古文タン 位階システム 設計書

単語練習の蓄積によってユーザが平安官位を昇進していく仕組みの設計まとめ。
コード本体は `src/lib/nobleData.ts` / `src/lib/fieldMastery.ts` / `src/lib/peakTiers.ts` / `src/lib/promotionHistory.ts` を参照。

---

## 1. 全体像 — 3 階層の昇進モデル

ユーザの「位階」は次の 3 つの層が連動して決まる:

```
[単語練習の累積]
   ├── word_stats (qid 単位の正答数 / 試行数)
   ├── quizTypeStats (qid × 種別 = 多義語 / 記述式)
   └── srs_state (qid 単位の SRS Box)
            │
            ▼
[★0–12 段位] computeTier()
   グループ (=1語) ごとに 13 段の代表官職へ写像
            │
            ▼
[5 部位 Lv] partLevelFromPct() ×5
   章 ch1–ch5 → 頭・袍・裾・持物・帯 へ Lv 1..N に変換
            │
            ▼
[21 ステージ (Stage)] effectiveStage()
   5 部位がすべて要求 Lv を満たした最高ステージ
            │
            ▼
[肖像 + 位階表示] portraitForStage() / NobleStatusBar
```

層が分かれているので**学習量・偏り・正答率**の組み合わせが視覚に反映される。

---

## 2. 21 ステージ (Stage) — 平安官位テーブル

定義: `src/lib/nobleData.ts:42-85`

### 2.1 4 つの era (時代区分)

| era | 範囲 (n) | milestone |
|---|---|---|
| 地下 (じげ) | 1–7 | — (初期状態) |
| 殿上人 | 8–15 | n=8 「殿上人デビュー」 |
| 公卿 | 16–20 | n=16 「公卿デビュー」 |
| 極位 | 21 | n=21 「太政大臣 (apex)」 |

### 2.2 各 Stage が持つ要求 Lv

```ts
type Stage = {
  n: number;        // 1..21
  rank: string;     // '無位' .. '正一'
  post: string;     // '雑任' .. '太政大臣'
  era: Tier;
  head: number;     // 要求 Lv (1..7)
  robe: number;     // 1..9
  train: number;    // 1..5
  item: number;     // 1..5
  belt: number;     // 1..5
  display: {...};   // 表示用の装束名
};
```

5 部位がすべて `parts[k] >= stage[k]` を満たした最大の Stage が**有効ステージ** (`effectiveStage`)。
逆に言うと、1 部位でも Lv 不足だと昇進しない → 章をまんべんなく進めるインセンティブ。

### 2.3 部位 Lv 上限 (`PART_MAX_LV`)

| 部位 | 章 | 章タイトル | Lv 上限 |
|---|---|---|---|
| head 頭 | ch1 | 読解必修語 | 7 |
| robe 袍 | ch2 | 入試必修語 | 9 |
| train 裾 | ch3 | 最重要敬語 | 5 |
| item 持物 | ch4 | 入試重要語 | 5 |
| belt 帯 | ch5 | 入試攻略語 | 5 |

ch2 (入試必修語) の上限が一番高く、装束全体の「色目」を支配する設計。

---

## 3. ★0–12 段位 (Tier) — 単語グループの習熟度

定義: `src/lib/fieldMastery.ts:40-52`

### 3.1 13 段位の対応表

| ★ | TIER_LABELS | TIER_KAII (代表官職) | era |
|---|---|---|---|
| 0 | 無位 | — | 地下 |
| 1 | 八位 | 少録 | 地下 |
| 2 | 七位 | 大允 | 地下 |
| 3 | 六位 | 国守 | 地下 |
| 4 | 従五下 | 少納言 | 殿上人 |
| 5 | 従五上 | 侍従 | 殿上人 |
| 6 | 正五 | 近衛少将 | 殿上人 |
| 7 | 従四 | 近衛中将 | 殿上人 |
| 8 | 正四 | 大弁 | 殿上人 |
| 9 | 従三 | 中納言 | 公卿 |
| 10 | 正三 | 大納言 | 公卿 |
| 11 | 二位 | 内大臣 | 公卿 |
| 12 | 一位 | 太政大臣 | 公卿 (真のマスター) |

### 3.2 `computeTier()` 閾値表

入力: その語グループの `total` (試行回数) / `correct` (正答数) / `polysemyCorrect` (多義語クイズ正解数) / `writingCorrect` (記述式正解数) / `maxBox` (SRS 最大箱)

| ★ | total | acc | 多義 (※多義語のみ) | 記述 | SRS box |
|---|---|---|---|---|---|
| 12 | ≥85 | ≥95% | ≥5 | ≥7 | ≥5 |
| 11 | ≥65 | ≥90% | ≥3 | ≥4 | ≥5 |
| 10 | ≥50 | ≥90% | ≥2 | ≥3 | ≥4 |
| 9 | ≥40 | ≥85% | ≥2 | ≥2 | ≥3 |
| 8 | ≥32 | ≥85% | ≥1 | ≥2 | ≥3 |
| 7 | ≥25 | ≥85% | ≥1 | ≥1 | ≥3 |
| 6 | ≥20 | ≥80% | polysemy≥1 OR writing≥1 | | |
| 5 | ≥15 | ≥80% | — | — | — |
| 4 | ≥10 | ≥75% | — | — | — |
| 3 | ≥5 | ≥70% | — | — | — |
| 2 | ≥3 | — | — | — | — |
| 1 | correct≥1 | — | — | — | — |
| 0 | (correct=0) | — | — | — | — |

「精度 × 試行数 × 多面性 × 記憶定着」の AND 条件で段階を区切る複合スコア。
「単に何度も解いた」だけでも、「単に多義語を1つ取った」だけでも上に進まない。

### 3.3 peak-lock (`src/lib/peakTiers.ts`)

一度達成した★は localStorage に保存され、その後**正答率が落ちても下がらない**。
退行シグナル (苦手単語タイル・SRS Due 件数) は別系統で警告するため、位階は片道進行。

---

## 4. 章習熟度 → 部位 Lv の変換

### 4.1 章ごとの `avgTierPct`

`fieldMastery.ts:155-195` で章 ch1–ch5 ごとに:

```
avgTierPct = round((Σ tier / (total * 12)) * 100)   // 0..100
masteredPct = round((★12 達成数 / total) * 100)
```

`avgTierPct` は「その章の全単語の平均段位」を 0–100% に正規化したもの。

### 4.2 `partLevelFromPct(avgPct, maxLv)`

```ts
lv = 1 + floor((min(100, avgPct) / 100) * (maxLv - 1) + 0.5);
```

線形 + 四捨五入で `1..maxLv` を返す。
例: ch1 (head, maxLv=7) で avgTierPct=50% → Lv = 1 + floor(50/100 * 6 + 0.5) = Lv 4。

### 4.3 集計フック `useFieldMastery()`

`fieldMastery.ts:210-267`

- 初回マウントで Supabase (`srs_state`) と localStorage (`quizTypeStats`) と word_stats を並列取得
- `window.focus` / `visibilitychange` で再 fetch → クイズから戻ったときに即反映
- `useMemo` で `computeFieldMastery()` を再計算

---

## 5. 部位 Lv → ステージの判定

### 5.1 `effectiveStage(parts)` (`nobleData.ts:200-209`)

5 部位の現在 Lv `parts` を渡し、`STAGES` を順に走査して**全部位が要求 Lv を満たす最大の Stage** を返す。

### 5.2 `nextStage(parts, currentN)` (`nobleData.ts:212-224`)

次のステージと、それを阻んでいる部位の一覧 (`have / need` 付き) を返す。
NobleStatusBar のプログレスバー (5 部位中いくつ満たしたか) に利用。

### 5.3 進捗率の表示

```
progress% = ((5 - blocking.length) / 5) * 100
```

つまり「次ステージへ向けて何部位 OK か」を 0/20/40/60/80/100% で示す。

---

## 6. 永続化

### 6.1 Supabase

| テーブル | キー | 用途 |
|---|---|---|
| `word_stats` | user_id × qid | correct / incorrect / last_seen |
| `srs_state` | user_id × qid | box (0..5) |

### 6.2 localStorage (`kobun.*` 名前空間)

| キー | 内容 | 書き元 |
|---|---|---|
| `kobun.noble.peakTiers` | group → max★ (peak-lock) | `peakTiers.ts` |
| `kobun.noble.history` | `PromotionRecord[]` (n, rank, post, era, ts) | `promotionHistory.ts` |
| `kobun.noble.peakStage` | 最高到達ステージ番号 | (任意拡張) |
| `kobun.noble.showKakejiku` | 掛軸ダッシュボードの開閉状態 | UI 設定 |
| `kobun-quiz-type-correct` | qid → {polysemy?, writing?} | `quizTypeStats.ts` |

設計上、**位階関連はすべて localStorage 側**にあり、Supabase は素のクイズ採点だけを保持する。
複数端末で揃わない代わりに、移行時の互換性破壊なく階位ロジックを差し替えられる構成。

---

## 7. UI コンポーネント

### 7.1 `NobleStatusBar` (`src/components/noble/NobleStatusBar.tsx`)

ホーム最上部に常駐。表示:

- 56×76 px の肖像サムネ (`PORTRAITS` から `portraitForStage(n)` で選択 — 全 8 バンド)
- `rank`・`post`
- 「次のステージまで」プログレスバー
- 3 KPI: streak / totalAnswered / masterCount

### 7.2 `NobleStatsDashboard` (591 行・掛軸スタイル)

- 大きな水彩肖像 (era・milestone に応じて演出強化)
- 5 部位の現在 Lv + 部位名 (`display.head` 等の和風名)
- 5 章ごとのリンク (`masteredPct`・`avgTierPct` 付き)
- 出世絵巻 (`promotionHistory`) への導線
- 装束図鑑 (`PART_CHARTS`) への導線

### 7.3 段位バッジ (`StatsPage`)

★0–12 を 3 トーンで色分け:
- ★0: 無位 (灰)
- ★1–3: 地下 (`var(--rw-ink-soft)`)
- ★4–8: 殿上人 (`var(--rw-accent)`)
- ★9–12: 公卿 (`var(--rw-primary)`)

`TIER_TONE` で era 別の bg/fg/accent を定義 (極位は金トーン)。

---

## 8. 設計上の重要ポイント

### 8.1 peak-lock の意味

学習者の努力が下がらない安心感を担保する一方、退行は別 UI で表面化させる二系統設計。
「位階は一度取った最高記録」「日々の調子は SRS Due / 苦手タイル」と役割分担している。

### 8.2 多元的閾値の意味

★ の判定が `total × acc × polysemy × writing × SRS box` の AND 条件なので、
- 同じ単語ばかり叩いても進まない (SRS box が必要)
- SRS だけ通しても進まない (記述・多義条件が要る)
- 多義語と単義語で閾値が分岐 (`isPolysemous`)

「分かったつもり」を排除し、多面的に習熟しないと最上位 (★12) に届かない。

### 8.3 章独立進行

5 部位は章独立で進めるので、ユーザは好きな順番に手を付けられる。
ただし**昇進判定は AND** なので、最終的には全章を磨かないと上の Stage に行けない。
偏りを許容しつつ最終的に網羅させる balanced 設計。

### 8.4 視覚と意味論の対応

- 「位階上昇」≒ 色 (袍) の濃化 + 装飾 (烏帽子・笏・太刀) の格上げ
- era の境界 (殿上人・公卿・極位) はビジュアルが大きく切り替わる milestone
- 肖像 (`PORTRAITS`) は 8 バンド (ステージ 1–21 をグループ化) に分けて切替

平安官位の階梯と装束色目を学習進捗にマップし、**学ぶこと自体が「物語の主人公の出世」になる**。

---

## 9. 拡張余地 / 注意点

- **多端末同期**: 現状 peak / history は localStorage 限定。Supabase テーブル `noble_state` を追加するなら ここの読み書きを差し替える設計。
- **退行表現**: SRS Due 件数が多い場合に「位階に陰り」のような表現を入れる余地。
- **章追加**: ch1–ch5 ハードコードのため、新章追加には `VISIBLE_CHAPTER_IDS` / `PART_MAX_LV` / `partsFromFieldMastery` を同時更新。
- **★閾値の調整**: `computeTier` の数値は経験的に置いているもので、回数 / 正答率の分布が変われば再キャリブレーションが要る。

---

## 10. 関連ファイル一覧

| ファイル | 役割 |
|---|---|
| `src/lib/nobleData.ts` | STAGES / PORTRAITS / PART_CHARTS / effectiveStage / partLevelFromPct |
| `src/lib/fieldMastery.ts` | computeTier / computeFieldMastery / useFieldMastery |
| `src/lib/peakTiers.ts` | peak-lock の I/O |
| `src/lib/promotionHistory.ts` | 昇進履歴の I/O |
| `src/lib/quizTypeStats.ts` | 多義 / 記述の正解数 |
| `src/lib/wordStats.ts` | qid → correct/incorrect |
| `src/components/noble/NobleStatusBar.tsx` | ホーム上部のステータスバー UI |
| `src/components/noble/NobleStatsDashboard.tsx` | 掛軸ダッシュボード |
| `src/utils/chapters.ts` | CHAPTERS / chapterFor |
