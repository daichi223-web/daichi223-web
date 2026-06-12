// ============================================================
// 文法道場・講義動画アップロード（mp4 → Storage + grammar_media 登録）
//
// 動画が用意できたら、これ1コマンドで「アップロード＋DB登録」まで完了する。
// フロント（VideoEmbed）は grammar_media に行があれば自動で動画を表示するので、
// 追加のコード変更は不要。
//
// 使い方（プロジェクト直下で）:
//   node --env-file=.env.local scripts/grammar-video.mjs <topicId> <mp4パス> "<タイトル>" [秒数]
//
// 例:
//   node --env-file=.env.local scripts/grammar-video.mjs jodoshi-mu ./videos/jodoshi-mu.mp4 "助動詞「む」講義（デ板）" 540
//
// 削除（動画とDB行を取り消す）:
//   node --env-file=.env.local scripts/grammar-video.mjs --delete <topicId>
//
// 既存のアップロード済み動画を別トピックにも紐付け（アップロードなし・行追加のみ）:
//   node --env-file=.env.local scripts/grammar-video.mjs --link <topicId> <storagePath> "<タイトル>" [秒数]
//
// 必要な環境変数（.env.local にあり）: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "grammar-videos";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✘ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定。`--env-file=.env.local` を付けて実行してください。");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);

async function del(topicId) {
  if (!topicId) {
    console.error("✘ 使い方: --delete <topicId>");
    process.exit(1);
  }
  const { data: rows } = await sb.from("grammar_media").select("storage_path").eq("topic_id", topicId);
  const paths = (rows ?? []).map((r) => r.storage_path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  const { error } = await sb.from("grammar_media").delete().eq("topic_id", topicId);
  if (error) { console.error("✘ DB削除失敗:", error.message); process.exit(1); }
  console.log(`✓ ${topicId} の動画とDB行を削除（Storageから ${paths.length} 件）`);
}

async function upload(topicId, mp4Path, title, sec) {
  if (!topicId || !mp4Path || !title) {
    console.error('✘ 使い方: <topicId> <mp4パス> "<タイトル>" [秒数]');
    process.exit(1);
  }
  const storagePath = `${topicId}.mp4`;
  console.log(`↑ アップロード中: ${basename(mp4Path)} → ${BUCKET}/${storagePath}`);
  const body = await readFile(mp4Path);

  const up = await sb.storage.from(BUCKET).upload(storagePath, body, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (up.error) { console.error("✘ アップロード失敗:", up.error.message); process.exit(1); }

  // grammar_media を topic 単位で入れ替え（再実行可能）
  await sb.from("grammar_media").delete().eq("topic_id", topicId);
  const { error } = await sb.from("grammar_media").insert({
    topic_id: topicId,
    kind: "mp4",
    storage_path: storagePath,
    title,
    sec: sec ? Number(sec) : null,
    sort: 0,
  });
  if (error) { console.error("✘ DB登録失敗:", error.message); process.exit(1); }

  const pub = sb.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  console.log(`✓ 完了。公開URL: ${pub}`);
  console.log(`  → 文法道場の「${topicId}」ページを開くと動画が表示されます。`);
}

/** アップロードのみ（DB登録なし）。複数トピック共有や 1 トピック複数動画用 */
async function uploadOnly(storagePath, mp4Path) {
  if (!storagePath || !mp4Path) { console.error("✘ 使い方: --upload <storagePath> <mp4パス>"); process.exit(1); }
  const body = await readFile(mp4Path);
  const up = await sb.storage.from(BUCKET).upload(storagePath, body, { contentType: "video/mp4", upsert: true });
  if (up.error) { console.error("✘ アップロード失敗:", up.error.message); process.exit(1); }
  console.log(`✓ upload: ${BUCKET}/${storagePath}`);
}

/** 既存 Storage 動画をトピックに紐付け（行追加のみ・既存行は消さない） */
async function linkRow(topicId, storagePath, title, sec) {
  if (!topicId || !storagePath || !title) { console.error('✘ 使い方: --link <topicId> <storagePath> "<タイトル>" [秒数]'); process.exit(1); }
  const { count } = await sb.from("grammar_media").select("id", { count: "exact", head: true }).eq("topic_id", topicId);
  const { error } = await sb.from("grammar_media").insert({
    topic_id: topicId, kind: "mp4", storage_path: storagePath, title,
    sec: sec ? Number(sec) : null, sort: count ?? 0,
  });
  if (error) { console.error("✘ link失敗:", error.message); process.exit(1); }
  console.log(`✓ link: ${topicId} ← ${storagePath} (sort=${count ?? 0})`);
}

if (args[0] === "--delete") {
  await del(args[1]);
} else if (args[0] === "--upload") {
  await uploadOnly(args[1], args[2]);
} else if (args[0] === "--link") {
  await linkRow(args[1], args[2], args[3], args[4]);
} else {
  await upload(args[0], args[1], args[2], args[3]);
}
