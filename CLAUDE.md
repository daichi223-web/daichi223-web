# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**古文たん (kobun-tan)** is a Japanese classical-literature (古文) learning PWA for students. It has two largely independent product surfaces sharing one React app:

1. **Vocabulary / polysemy quiz** (`/`, `src/App.tsx`) — multiple-choice and free-text (記述) quizzes over 古文 vocabulary, graded by a morphological grading engine that judges meaning + grammatical nuance.
2. **Reading comprehension v3** (`/read/*`, `src/pages/HomeV3.tsx` and friends) — full annotated 古文 texts with tokenized sentences, tappable grammar popovers, and layered learning hints.

Stack: React 18 + TypeScript + Vite + TailwindCSS + React Router 7. Backend is Supabase (anonymous auth + RLS) plus Vercel serverless functions in `api/`. UI text, comments, and commit messages are in Japanese — match this convention.

## Commands

```bash
npm run dev          # Vite dev server on :3000
npm run build        # Production build to dist/
npm run preview      # Preview built output
npm test             # Vitest (watch mode)
npm run test:ui      # Vitest with UI
npm run lint         # ESLint (ts/tsx, --max-warnings 0)
npm run check:cycles # madge circular-dependency check on src/
npm run demo -- --jp "悲しきこと" --student "悲しくけり"  # CLI demo of the grading engine
```

Run a single test file: `npx vitest run src/tests/srsEngine.test.ts`
Run tests matching a name: `npx vitest run -t "係り結び"`

Tests live in `src/tests/`. Vitest runs in the `node` environment with the `@` → `src/` alias.

### Data pipeline (build:* scripts)

The learning content under `public/` is **generated** by Python and Node scripts in `scripts/`, sourced from an external NotebookLM Obsidian vault (hard-coded Windows paths like `F:/A2A/NotebookLM/...`). These only run on the content author's machine — do not expect them to work in this environment.

```bash
npm run build:data   # full regen: match → vocab → examples → texts
npm run build:vocab  # vocab bundle → src/data/vocabIndex.json
npm run build:texts  # extract + enrich texts-v3 JSON
```

`scripts/` also contains many **one-off** `enrich-<id>-hints.cjs` / `fix-<id>-*.cjs` scripts named by text ID — these are historical per-text data patches, not part of any build.

## Architecture

### Two data models for vocabulary

- **Source of truth**: `data/kobun_q.jsonl.txt` (human-editable) → bundled into `src/data/kobunQ.json`.
- `src/types.ts` defines `WordData` (raw rows) and the derived `Word` / `MultiMeaningWord`. `src/utils/dataParser.ts` (`DataParser` class) loads the bundle and groups senses into multi-meaning words for polysemy mode.
- `qid` format is `<group>-<meaning_idx>` (e.g. `341-3`).

### Grammar / grading engine

This is the most architecturally significant subsystem (see `GRAMMAR_ENGINE_README.md` and `REQUIREMENTS.md` for full design). `src/assets/kobun-grammar.json` is the single source of truth for 古文 grammar rules (auxiliary verbs, particles, conjugation/connection rules). Grading separates the *meaning core* (lemma) from *grammatical nuance* (aux tags):

- `src/utils/morphTokenizer.ts` — splits an answer into `{ lemma, aux: Set<string> }`, normalizing modern-Japanese spelling variation into 古文 grammar tags.
- `src/utils/normalizeSense.ts` — spelling/notation normalization.
- `src/utils/formGuesser.ts` — infers conjugation form (活用形) from context.
- `src/utils/matchSense.ts` / `src/scoring/gradeMeaning*.ts` — lemma-first scoring (lemma match is mandatory; aux tags add partial credit).
- `src/lib/gradeWithMorph.ts` + `validateConnectionsFromFile.ts` — weighted scoring with connection-rule penalties (係り結び, auxiliary attachment). Tunable `WEIGHTS` constant; pass ≥ 70% with no connection violations.
- `src/lib/grammarLoader.ts` — loads and indexes the grammar JSON.

### Reading comprehension v3

Texts live in `public/texts-v3/<id>.json`, keyed by an opaque hash ID. Each file has `sentences[].tokens[]` with `start`/`end` offsets into `originalText` and a `grammarTag` (incl. `conjugationForm` 未/用/終/体/已/命) plus optional `hint` / layered `learningPoints`. Two structural invariants must hold:

- `sentence.tokens.map(t => t.text).join('')` === `sentence.originalText`
- `sentence.originalText.slice(t.start, t.end)` === `t.text`

Rendering: `src/components/kobun/TokenizedText.tsx` → `TokenSpan.tsx`; tapping a token opens `GrammarPopover.tsx` (the yellow 重要ポイント box only shows when `token.hint` is set). `LayerSelector` drives the multi-layer learning view. The older `public/texts/` (v1) format still exists alongside v3.

### Gamification & progress

- **SRS** (`src/lib/srsEngine.ts`): Leitner 5-box, intervals 0/1/3/7/14 days. Correct → box+1 (max 5), incorrect → box 1.
- **段位 / noble rank** (`src/lib/peakTiers.ts`, `nobleData.ts`, `promotionHistory.ts`, `src/components/noble/`): per-word peak ★ tier is **peak-locked** — once achieved it never drops even if accuracy/SRS regresses. Regression is surfaced through separate channels (weak-word tiles, SRS due count), not by lowering rank.
- `src/lib/wordStats.ts`, `quizTypeStats.ts`, `fieldMastery.ts`, `streak.ts` track per-word/per-type stats; `StatsPage.tsx` visualizes them.

### Persistence & sync

- **localStorage is the primary store** for learner progress. `src/lib/storageKeys.ts` is a **central registry** — when adding a key, register it there and include it in `EXPORTABLE_KEYS` (backup/export). **Never rename existing keys**: deployed clients would orphan their data. Backup/restore lives in `src/lib/backup.ts` + `src/components/BackupSection.tsx`.
- **Supabase** (`src/lib/supabase.ts`, `anonAuth.ts`): anonymous sign-in fires once at startup in `src/main.tsx` (`ensureAnonSession`) so RLS-protected writes have an `auth.uid`. Schema/RLS in `supabase/migrations/`.

### Serverless API (`api/`)

Vercel functions for answer submission, teacher/admin views, and a daily cron (`aggregateCandidates`, see `vercel.json` `crons`). Auth helper `api/_requireStaff.ts` accepts: `Bearer CRON_SECRET` (cron), `admin_session` cookie + CSRF double-submit on unsafe methods (preferred), or legacy `x-admin-token`/`?token` (`ADMIN_VIEW_TOKEN`). The Teacher UI is `src/pages/Teacher.tsx`.

### Routing & loading (`src/main.tsx`)

`App` and `TestGrading` are eager; everything else (`/read/*`, `/teacher`, `/stats`, `/texts`, `/search`) is `React.lazy`. URL params consumed before React mounts: `?unlock=<phrase>` (`fullAccess.ts`), `?cohort=<name>` (`cohort.ts` — grade/school-specific text sets).

### PWA caveat

`vite-plugin-pwa` is configured with **`selfDestroying: true`** — the Service Worker is intentionally disabled. School networks (Cisco Umbrella SWG) redirect SW `importScripts` to an SSO wall, breaking the whole PWA. The current SW only unregisters old SWs and clears caches. Don't re-enable a real SW without solving that. The `manifest` (install banner via `PWAInstallBanner.tsx`) is still active.

## Conventions & gotchas

- `@/` aliases `src/` (configured in `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`). `path` is aliased to `path-browserify`.
- `.gitignore` ignores `*.json` by default with explicit `!` un-ignores for `public/**/*.json`, `src/data/*.json`, and config JSON. New committed JSON data must live under those paths or be force-added.
- `dist/` is git-ignored, but per `BUILD_INSTRUCTIONS.md` the author historically builds on **Windows** (WSL `npm install` is too slow) — don't assume a committed `dist/`.
- Root has many loose `kobun-app*.html` / `test-*.html` files and `dist-backup/` — these are legacy/standalone artifacts, not the Vite app. The live app is the `src/` React tree served from `index.html`.
- Detailed feature specs are in Japanese: `REQUIREMENTS.md` (grading engine), `GRAMMAR_ENGINE_README.md`, and the `範囲選択コンポーネント*.txt` files (range-picker component history).

## Project-specific data-maintenance skills

`.claude/skills/` defines specialized pipelines for curating `public/texts-v3/<id>.json`. Invoke the matching one when doing that kind of content work:

- **kobun-canonical-verification** — verify/repair `originalText` against canonical 校本 (detect AI-introduced summarization/fabrication).
- **kobun-conjugation-form-check** — verify each token's `grammarTag.conjugationForm` against the form implied by the following connecting element.
- **kobun-token-alignment-fix** — repair broken `tokens` ↔ `originalText` joins and `start`/`end` offsets without touching meaning data.
- **kobun-token-hints** — add `token.hint` learning points (and back-port to NotebookLM MD).
- **kobun-cultural-context** — add 古文常識 (background knowledge) across hint / layer5 / reading-guide slots.
