# 文法ドリル「古文常識化」設計書

> 目的：文法道場の各ドリルに **出典＋作品解説＋場面のメタ解説** を付与し、文法練習のたびに古文常識が積み上がる方式にする。
> 方針：既存スキーマ（`grammar_drills`）を壊さず、**追加カラム＋参照事典** で拡張。作品解説は重複させず一元管理。
> 制約：8GB機につき生成は**逐次ワークフロー**。精度は `.claude/rules/accuracy.md`（辞書にない語義を創作しない／両論併記）に準拠。

関連：[[grammar-dojo-learning-design]] / [[grammar-drill-design]] / 例文集 [[助動詞例文集]]

---

## 1. 現状（grounding）

- テーブル `grammar_drills`（`supabase/migrations/007_grammar_dojo.sql:28-40`）
  `id / topic_id / kind / prompt / context / choices / answer / explanation / ref_heading / sort`
- 出典は現在 **explanation 文に手書き埋め込み**（例：「…（大鏡・肝試し）」）。構造化されていない。
- TS型 `GrammarDrill`（`src/lib/kobun/types.ts:174` 付近）。
- 表示：解答後の解説ブロック `src/components/grammar/DrillSession.tsx:155-173`。
  現状は `explanation` を 1 つの `<p>` で出すのみ。ここが増補の挿入点。

---

## 2. データモデル

### 2.1 grammar_drills へ追加（migration 008・すべて nullable＝後方互換）

| カラム | 型 | 用途 |
|---|---|---|
| `source` | text | 出典（作品・章段）例: `大鏡・肝試し` |
| `work_key` | text | 作品事典のキー（`source` から作品名のみ）例: `大鏡` |
| `scene_note` | text | **この文の場面・メタ解説**（誰が・どこで・何をしている文か。1問固有） |
| `joshiki_tags` | jsonb | 古文常識タグ `string[]` 例: `["時刻","肝試し","花山天皇"]` |

```sql
-- 008_grammar_dojo_joshiki.sql
alter table grammar_drills add column if not exists source       text;
alter table grammar_drills add column if not exists work_key     text;
alter table grammar_drills add column if not exists scene_note   text;
alter table grammar_drills add column if not exists joshiki_tags jsonb;
```

### 2.2 作品事典 grammar_works（新規・公開read）

作品解説は同作品の多数ドリルで共有するため**ドリルに持たせず一元化**（重複・不整合の防止）。

```sql
create table if not exists grammar_works (
  work_key   text primary key,        -- '大鏡'
  title      text not null,           -- '大鏡'
  genre      text not null,           -- '歴史物語'
  era        text,                    -- '平安後期（11C末〜12C初）'
  author     text,                    -- '未詳'
  style      text,                    -- '紀伝体・和文'
  summary    text not null,           -- 2〜3文の作品解説
  joshiki    jsonb,                   -- この作品で頻出する古文常識 string[]
  sort       int default 0,
  created_at timestamptz default now()
);
alter table grammar_works enable row level security;
create policy "public_read_grammar_works" on grammar_works for select using (true);
```

> 規模感：現ドリルの distinct 出典作品は **～40 作品** 程度。事典は一度作れば全ドリルで再利用。

### 2.3 古文常識ミニ事典 grammar_joshiki（任意・第2段）

タグをクリックで開くミニ解説。最初は省略可（タグだけ表示）→ 後から事典を肉付け。

```sql
create table if not exists grammar_joshiki (
  tag text primary key,          -- '除目'
  yomi text,                     -- 'じもく'
  note text not null,            -- 1〜2文の解説
  category text                  -- '官職/年中行事/恋愛/信仰/住居' 等
);
```

---

## 3. TS 型（src/lib/kobun/types.ts）

```ts
export interface GrammarDrill {
  // …既存…
  source?: string;
  workKey?: string;
  sceneNote?: string;
  joshikiTags?: string[];
}

export interface GrammarWork {
  workKey: string;
  title: string;
  genre: string;
  era?: string;
  author?: string;
  style?: string;
  summary: string;
  joshiki?: string[];
}

export interface GrammarJoshiki {
  tag: string;
  yomi?: string;
  note: string;
  category?: string;
}
```

DB(snake) → TS(camel) のマッピングは既存の取得層（`dojoData.ts`）に合わせる。

---

## 4. 表示（DrillSession.tsx）

解答後ブロック `:155-173` の `explanation` の `<p>` の**直後**に、折りたたみ式で順に追加。表示順＝**文法 → 出典 → 作品 → 場面 → 常識**（学習動線：まず正解理由、次に背景へ降りていく）。

```
◎ 正解！　解説
  📐 文法     drill.explanation（既存・常時表示）
  ──────────
  📖 出典     {source}
  🏛 作品     {work.summary}      ← work_key で grammar_works を引く（折りたたみ・既定で開）
  🎬 場面     {sceneNote}         ← 折りたたみ
  🏮 常識     {joshikiTags をチップ表示}→タップで grammar_joshiki（第2段）
```

- スタイルは既存トークン（`text-[13px] text-rw-ink leading-relaxed`、見出しは `text-[11px] font-black`）を踏襲。
- **後方互換**：各セクションは値が無ければ非表示（`{source && (…)}`）。既存 explanation はそのまま残す。
- 作品解説は同一セッションで同作品が連続することがあるため、**初出のみ既定オープン／2回目以降は畳む**等の最適化は任意。

---

## 5. データ投入計画（生成パイプライン）

**逐次ワークフロー**（並列なし＝8GB安全）。例文集ワークフロー完了後に着手。

### フェーズA：作品事典 grammar_works（先・小規模）
1. 既存全ドリルの `explanation` から出典文字列を抽出 → distinct 作品リスト化（スクリプト、生成不要）。
2. 作品ごとに1エージェント（逐次）で `summary/genre/era/author/style/joshiki` を Web 照合生成。捏造禁止・確証なきものは `要確認`。
3. レビュー後 `grammar_works` へ seed。

### フェーズB：場面解説 scene_note（後・273問規模）
1. ドリルを topic 単位でチャンク。1チャンク=1エージェント（逐次）。
2. 各問の `context`＋出典から「誰が・どこで・何を」「直前直後の文脈」「古文常識タグ」を生成。
3. `source / work_key / joshiki_tags / scene_note` を埋める update SQL を生成 → 適用。
   - supabase 反映は `supabase-go.exe db query --linked`（[[supabase-cli-windows-eperm]]）。

> 273問×逐次のため時間はかかる。タグの粒度（常識事典の見出し語彙）は最初に20〜40語で統制し、表記ゆれを防ぐ。

---

## 6. サンプル（実データ1件）

**作品事典エントリ**
```json
{
  "work_key": "大鏡",
  "title": "大鏡",
  "genre": "歴史物語",
  "era": "平安後期（11世紀末〜12世紀初）",
  "author": "未詳",
  "style": "紀伝体・和文（対話形式）",
  "summary": "190歳の大宅世継らが昔を語る形式で、藤原道長の栄華を批評を交えて描く歴史物語。『四鏡』の最初で、人物中心の紀伝体をとる。",
  "joshiki": ["藤原道長","摂関政治","花山天皇"]
}
```

**増補ドリル**（既存 jodoshi-suiryo-h07 を拡張）
```json
{
  "id": "jodoshi-suiryo-h07",
  "context": "かく仰せられ議するほどに、丑にもなりに【けむ】。",
  "answer": "過去推量（〜ただろう）",
  "explanation": "連用形＋けむ＝過去推量。「丑の刻にもなってしまっただろう」。",
  "source": "大鏡・肝試し",
  "work_key": "大鏡",
  "scene_note": "花山天皇が深夜に肝試しを命じ、道隆・道兼・道長の三兄弟が暗い殿舎へ向かう場面。語り手が「丑の刻（午前2時頃）にもなっただろう」と夜の更けを推量している。",
  "joshiki_tags": ["時刻（十二時辰）","肝試し","花山天皇","藤原道長"]
}
```

**画面（解答後）**
```
◎ 正解！　解説
📐 文法  連用形「なりに」＋けむ＝過去推量。
📖 出典  大鏡・肝試し
🏛 作品  190歳の大宅世継らが昔を語る形式で、藤原道長の栄華を…（大鏡＝歴史物語）
🎬 場面  花山天皇が深夜に肝試しを命じ、三兄弟が暗い殿舎へ…
🏮 常識  [時刻（十二時辰)] [肝試し] [花山天皇] [藤原道長]
```

---

## 7. 段階導入・リスク

- **DBは完全後方互換**：追加カラムは nullable、新テーブルは public read のみ。既存ドリル動作に影響なし。
- **UIも後方互換**：値が無ければ各セクション非表示。`source` 未設定の問題は従来通り。
- **精度**：作品解説・場面解説とも Web 照合し、確証なきものは `要確認` フラグ運用。両論あるものは併記。
- **タグ統制**：`grammar_joshiki` の見出し語を先に固定し、`joshiki_tags` はその語彙から選ばせる（表記ゆれ防止）。
- **工数の山**：フェーズB（273問の場面解説）が主。逐次のため長時間 → 分割実行・再開（resumeFromRunId）前提。

---

## 8. 実装チェックリスト（着手時）

- [ ] migration `008_grammar_dojo_joshiki.sql`（drills 4カラム＋works＋joshiki）
- [ ] types.ts：GrammarDrill 拡張／GrammarWork／GrammarJoshiki
- [ ] dojoData.ts：works 取得・drill への source/sceneNote マッピング
- [ ] DrillSession.tsx：解説ブロックに 出典/作品/場面/常識セクション追加
- [ ] フェーズA：作品事典の生成→seed
- [ ] フェーズB：場面解説・タグの生成→update
- [ ] grammar_joshiki ミニ事典（第2段）
