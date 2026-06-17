# 助動詞例文集 アプリ実装設計（案A＋案B 両取り）

> 目的：完成した「助動詞例文集（拡充版・235例／助動詞9・意味23）」を、**単一データソース**から
> **(A) 意味判別ドリル** と **(B) 例文事典** の両方に流し込む。配置は既存の三層「型→混ぜる→実戦」に従わせる。
> 方針：例文集を新テーブル `grammar_reibun` に投入。出題は `confidence:high & verified` のみ、事典は全例。
> 既存 `grammar_drills` / 古文常識化設計（008）と語彙・カラムを共有し二重管理を避ける。後方互換で段階導入。

関連：[[grammar-dojo-learning-design]] / [[grammar-drill-design]] / 古文常識化 → `grammar-dojo-古文常識化_設計.md` / 素材 [[助動詞例文集]]
素材ファイル：`NotebookLM/kokugo-vault/20-文法/古文文法/助動詞例文集_拡充版.md`（構造化元 `F:/A2A/_all_sets.json`）

---

## 0. 素材データの形（grounding）

`_all_sets.json` = 配列。1要素＝1（助動詞×意味）セット：
```
{ jodoshi, meaning, decider_rule, examples:[
    { sentence(【】《》入り), translation, source, context(場面), decider(決め手), period, verified, confidence } ] }
```
- 助動詞9：けり/つ/ぬ/たり/り/まじ/けむ/らむ/ごとし
- 意味23、総例235、`confidence:high&verified`＝約174（出題候補）、medium/low＝事典のみ。

---

## 1. データモデル（migration 009）

### 1.1 例文マスタ `grammar_reibun`（新規・公開read）

```sql
create table if not exists grammar_reibun (
  id          text primary key,      -- 'reibun-keri-katako-01'
  jodoshi     text not null,         -- 'けり'
  meaning_key text not null,         -- 'keri-eitan'（係: choices/型のキー。表記ゆれ防止）
  meaning     text not null,         -- '詠嘆（気づき・感動）'（表示ラベル）
  sentence    text not null,         -- 本文（判定対象=【】, 決め手=《》）
  translation text not null,
  source      text not null,         -- 出典（作品・章段/歌集・部立・作者）
  work_key    text,                  -- 作品事典キー（古文常識化 grammar_works と共有）
  context     text,                  -- 📖 場面解説（古文常識の素地）
  decider     text,                  -- 決め手（意味判定の根拠）
  period      text,                  -- 成立期
  confidence  text not null check (confidence in ('high','medium','low')),
  verified    boolean not null default false,
  is_quiz     boolean not null default false,  -- 出題対象（high & verified のみ true）
  layer       text,                  -- 'kata'|'mazeru'|'jissen'（三層・任意。後述ロジックで付与）
  sort        int default 0,
  created_at  timestamptz default now()
);
alter table grammar_reibun enable row level security;
create policy "public_read_grammar_reibun" on grammar_reibun for select using (true);
create index if not exists idx_reibun_jodoshi on grammar_reibun(jodoshi);
create index if not exists idx_reibun_quiz on grammar_reibun(is_quiz);
```

### 1.2 意味マスタ `grammar_jodoshi_meanings`（新規・選択肢と型の生成元）

意味判別の**選択肢セット**と、型レイヤーの**決め手の総則**を一元管理。

```sql
create table if not exists grammar_jodoshi_meanings (
  meaning_key  text primary key,     -- 'keri-eitan'
  jodoshi      text not null,        -- 'けり'
  meaning      text not null,        -- '詠嘆（気づき・感動）'
  decider_rule text not null,        -- 「決め手の総則」（型レイヤーで提示）
  sort         int default 0
);
alter table grammar_jodoshi_meanings enable row level security;
create policy "public_read_grammar_meanings" on grammar_jodoshi_meanings for select using (true);
```
> これにより「けり」の選択肢＝`where jodoshi='けり'` の meaning 群（過去/詠嘆）を自動生成。

---

## 2. TS 型（src/lib/kobun/types.ts）

```ts
export interface GrammarReibun {
  id: string; jodoshi: string; meaningKey: string; meaning: string;
  sentence: string; translation: string; source: string; workKey?: string;
  context?: string; decider?: string; period?: string;
  confidence: 'high' | 'medium' | 'low'; verified: boolean; isQuiz: boolean;
  layer?: 'kata' | 'mazeru' | 'jissen';
}
export interface GrammarJodoshiMeaning {
  meaningKey: string; jodoshi: string; meaning: string; deciderRule: string;
}
```
DB(snake)→TS(camel) は既存 `dojoData.ts` の流儀に合わせる。

---

## 3. 案A：意味判別ドリル

各 `is_quiz` 例文を1問に変換：
- **問題**＝`sentence`（`【助動詞】`の意味は？）
- **選択肢**＝`grammar_jodoshi_meanings` の同一 `jodoshi` の意味群（実戦のみ他助動詞からダミーを加える）
- **正解**＝その例文の `meaning`
- **解説**＝`decider` ＋ 📖`context` ＋ 出典`source`（古文常識化の表示動線をそのまま流用）

実装は2択：
- **A1（推奨・低リスク）**：seed 時に `grammar_reibun(is_quiz)` から `grammar_drills` 行を派生生成（`kind:'jodoshi-imi'`、`choices`＝意味群、`explanation`＝decider、`scene_note`＝context、`source/work_key`）。**DrillSession.tsx は無改修**で動く。約174問が即追加。
- **A2**：`grammar_reibun` を DrillSession から動的出題する新モード。柔軟だがUI改修要。
→ まず A1 で出題を立ち上げ、必要なら A2 へ。

**選択肢設計の注意**：
- 2意味しかない助動詞（けり/つ/ぬ/たり/り）は素で2択＝易。混ぜる層で他助動詞のダミーを足して難度調整。
- まじ（5意味）/けむ・らむ（3意味）は素で良問になる。
- `decider` に両論注記のある medium 例は出題から除外（is_quiz=false）し事典送り。

---

## 4. 案B：例文事典

閲覧リファレンス。新ルート `/read/grammar/reibun`（または文法道場内に「例文」タブ）。
```
助動詞アコーディオン（けり/つ/…/ごとし）
  └ 意味（過去/詠嘆/…）
       決め手の総則（grammar_jodoshi_meanings.decider_rule）
       例カード ×N：
         本文（【】《》ハイライト）／訳
         📖 場面 ─ context
         🏛 出典 ─ source（work_key があれば作品事典へリンク）
         🔑 決め手 ─ decider　／ 成立期 ─ period
         確信度バッジ（high=実線 / medium=点線 / low=⚠）
  フィルタ：助動詞・意味・出典作品・確信度
```
- 全235例を活用（medium/low も資料として価値）。
- スタイルは既存トークン（`text-[13px] text-rw-ink`、見出し `text-[11px] font-black`）踏襲。
- ドリル解答後の「この用法の他の例を見る」→ 該当 `jodoshi+meaning_key` の事典へ遷移（A↔B連携）。

---

## 5. 案D：三層「型→混ぜる→実戦」への配置（layer 付与ロジック）

`layer` はseed時にスクリプトで付与（手調整可）：
- **型(kata)**：各（助動詞×意味）の最も確実な high 例を1〜2問。`decider_rule` を前面に出し「1意味だけを覚える」。選択肢は出さず提示中心、または2択。
- **混ぜる(mazeru)**：同一助動詞の複数意味を交ぜた意味判別（選択肢＝その助動詞の全意味）。**ここが核**。
- **実戦(jissen)**：助動詞をまたいで混在（本文ベース）。選択肢に他助動詞のダミー、出典は入試頻出作品優先。
- 難度＝`(意味数, confidence, 決め手の明示度)` で序列化。

---

## 6. データ投入パイプライン（8GB配慮・生成不要＝変換のみ）

1. `_all_sets.json` → 変換スクリプト（Node、**生成エージェント不要**）で
   - `grammar_reibun` 行：id採番、`meaning_key` 採番（ローマ字 slug）、`is_quiz = (confidence==='high' && verified)`。
   - `grammar_jodoshi_meanings` 行：各セットの jodoshi/meaning/decider_rule を1行に。
   - `layer` 初期付与（上記ロジック）。
2. seed SQL を生成 → `supabase-go.exe db query --linked` で適用（[[supabase-cli-windows-eperm]]）。
3. （A1採用時）`grammar_reibun(is_quiz)` → `grammar_drills` 派生 insert。
> 全て変換処理なのでクラッシュ要因（並列生成）なし。

---

## 7. 段階導入・リスク

- **DB完全後方互換**：新テーブル2つ＋public read のみ。既存ドリルに影響なし。
- **出題の質**：`is_quiz` を high&verified に限定。medium/low は事典のみ。両論ある例は出題除外。
- **作品事典との統合**：`work_key` で `grammar_works`（008）と接続。古文常識タグも将来共有可。
- **既知の穴**：けむ婉曲(2)/らむ婉曲(1)/ごとし例示(8) は確例が乏しく出題数が薄い → 事典では「確例僅少」と明示、出題は混ぜる層で補完。
- **要確認61件**：事典では ⚠ 表示、出題には含めない。人手照合で is_quiz 昇格を運用。

---

## 8. 実装チェックリスト

- [ ] migration `009_grammar_reibun.sql`（grammar_reibun＋grammar_jodoshi_meanings）
- [ ] types.ts：GrammarReibun／GrammarJodoshiMeaning
- [ ] 変換スクリプト：`_all_sets.json` → reibun/meanings/（drills派生）seed
- [ ] seed 適用（supabase-go db query --linked）
- [ ] 案B：`/read/grammar/reibun` 事典ビュー（アコーディオン＋フィルタ）
- [ ] 案A(A1)：drills 派生で意味判別を出題に追加（DrillSession 無改修）
- [ ] A↔B 連携：解答後「他の例を見る」リンク
- [ ] layer 付与の手調整（型/混ぜる/実戦）
- [ ] （第2段）まじ要確認の照合→is_quiz 昇格、婉曲のWeb増補
