// api/_teacher_usageData.ts
//
// 教員画面「利用状況」タブのデータ源。scripts/usage-report.mjs のデータ取得部を API 化したもの。
//   GET /api/teacher?action=usageData            … 直近1年（既定）
//   GET /api/teacher?action=usageData&from=all   … 全期間
//   GET /api/teacher?action=usageData&from=YYYY-MM-DD
// 生行（word_stats / srs_state / grammar_topic_progress）を期間で絞って返し、集計はブラウザ側
// （scripts/usage-aggregate.js）で行う。語・ドリルの見出しはクライアントがバンドル済み JSON から引く。
//
// 個人の識別は「学校コード（KU/UW）＋年・組・番号」だけ。メールなど他の個人情報は復号しても返さない。
// user_id の生値は返さず、先頭 8 桁（衝突時は延長）に置き換える。
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";
import { getEncryptionKey, decrypt } from "./_pii.js";
import { schoolCode } from "../src/lib/schools.js";

const PAGE = 1000;
const PARALLEL = 4;

type Filter = (q: any) => any;

/** 全行取得（1000 行ずつ、PARALLEL 並列）。order は range ページングを安定させるために必須 */
async function fetchAll(table: string, cols: string, order: string[], filter?: Filter): Promise<any[]> {
  const apply = (q: any) => (filter ? filter(q) : q);
  const { count, error: cerr } = await apply(supabaseAdmin.from(table).select("*", { count: "exact", head: true }));
  if (cerr) throw new Error(`${table}: ${cerr.message}`);
  const total = count ?? 0;
  const rows: any[] = [];
  for (let start = 0; start < total; start += PAGE * PARALLEL) {
    const jobs = [];
    for (let k = 0; k < PARALLEL && start + k * PAGE < total; k++) {
      const from = start + k * PAGE;
      let q: any = apply(supabaseAdmin.from(table).select(cols));
      for (const o of order) q = q.order(o, { ascending: true });
      jobs.push(q.range(from, from + PAGE - 1));
    }
    const results = await Promise.all(jobs);
    for (const r of results) {
      if (r.error) throw new Error(`${table}: ${r.error.message}`);
      rows.push(...(r.data ?? []));
    }
  }
  return rows;
}

/** ISO 日時 → JST の "YYYY-MM-DD" */
const jstDay = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : "";

/** ?from= の解釈。"all" = 全期間、日付ならその日から、無指定 = 直近1年 */
function resolveFrom(raw: unknown, today: string): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "all") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = new Date(today + "T00:00:00Z");
  t.setUTCFullYear(t.getUTCFullYear() - 1);
  return t.toISOString().slice(0, 10);
}

type Ident = { school: string; grade?: number | null; cls?: number | null; num?: number | null };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);
    if ((req.method || "GET").toUpperCase() !== "GET") {
      return res.status(405).json({ error: "GET only" });
    }
    const today = jstDay(new Date().toISOString());
    const from = resolveFrom(req.query.from, today);
    // JST の日付境界を UTC の ISO に直す（DB は UTC 保存）
    const fromIso = from ? new Date(new Date(from + "T00:00:00Z").getTime() - 9 * 3600e3).toISOString() : null;
    const since = (col: string): Filter | undefined => (fromIso ? (q) => q.gte(col, fromIso) : undefined);

    const [ws, srs, drills, prog, pubs, profiles] = await Promise.all([
      fetchAll("word_stats", "user_id,qid,correct,incorrect,last_seen,created_at", ["user_id", "qid"], since("last_seen")),
      fetchAll("srs_state", "user_id,qid,box,next_review,last_review", ["user_id", "qid"], since("last_review")),
      fetchAll("grammar_drills", "id,topic_id", ["id"]),
      fetchAll(
        "grammar_topic_progress",
        "user_id,topic_id,drill_total,drill_correct,mastery_pct,updated_at",
        ["user_id", "topic_id"],
        since("updated_at"),
      ),
      fetchAll("text_publications", "slug,cohort,published", ["slug", "cohort"]),
      fetchAll("profiles", "id,profile_enc,cohort", ["id"]),
    ]);

    // ---- プロフィール復号：学校コード＋年・組・番号だけ（メールは取り出さない） ----
    let key: CryptoKey | null = null;
    try {
      key = await getEncryptionKey();
    } catch {
      key = null;
    }
    const identity = new Map<string, Ident>();
    let decryptFailed = 0;
    for (const p of profiles) {
      const ident: Ident = { school: schoolCode(p.cohort) };
      if (key && p.profile_enc) {
        const plain = await decrypt(p.profile_enc, key);
        if (plain) {
          try {
            const o = JSON.parse(plain);
            ident.grade = o.grade ?? null;
            ident.cls = o.class ?? null;
            ident.num = o.number ?? null;
          } catch {
            decryptFailed++;
          }
        } else decryptFailed++;
      }
      identity.set(p.id, ident);
    }

    // ---- 匿名 ID → index（先頭 8 桁、衝突時は延長） ----
    const uidx = new Map<string, number>();
    const users: Array<{ id: string } & Partial<Ident>> = [];
    const seen = new Set<string>();
    const uOf = (uid: string) => {
      const hit = uidx.get(uid);
      if (hit !== undefined) return hit;
      let short = uid.slice(0, 8);
      while (seen.has(short)) short = uid.slice(0, short.length + 4);
      seen.add(short);
      uidx.set(uid, users.length);
      users.push({ id: short, ...(identity.get(uid) ?? {}) });
      return users.length - 1;
    };
    for (const p of profiles) uOf(p.id); // 登録済みだが学習記録のない人も一覧に出す

    const cohorts = new Map<string, { pub: number; unpub: number }>();
    for (const p of pubs) {
      const c = cohorts.get(p.cohort ?? "(none)") ?? { pub: 0, unpub: 0 };
      if (p.published) c.pub++;
      else c.unpub++;
      cohorts.set(p.cohort ?? "(none)", c);
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      generatedAt: new Date().toISOString(),
      today,
      from,
      users,
      ws: ws.map((r) => [uOf(r.user_id), r.qid, r.correct ?? 0, r.incorrect ?? 0, jstDay(r.last_seen), jstDay(r.created_at)]),
      srs: srs.map((r) => [uOf(r.user_id), r.qid, r.box ?? 0, jstDay(r.next_review), jstDay(r.last_review)]),
      prog: prog.map((r) => [
        uOf(r.user_id),
        r.topic_id,
        r.drill_total ?? 0,
        r.drill_correct ?? 0,
        r.mastery_pct ?? 0,
        jstDay(r.updated_at),
      ]),
      drills: drills.map((d) => [d.id, d.topic_id]),
      publishedSlugs: pubs.filter((p) => p.published).map((p) => p.slug),
      publicationCohorts: [...cohorts.entries()].map(([c, o]) => ({ cohort: c, pub: o.pub, unpub: o.unpub })),
      registered: profiles.length,
      piiDecrypted: !!key,
      decryptFailed,
      schools: [...new Set(profiles.map((p) => schoolCode(p.cohort)))].sort(),
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
