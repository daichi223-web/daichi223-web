// api/_usageIdentity.ts
//
// 教員画面「利用状況」の API（_teacher_usageData / _teacher_usageAreas）で共用する、利用者の表示名づくり。
// 個人の識別は「学校コード（KU/UW）＋年・組・番号」だけ。メールなど他の個人情報は復号しても取り出さない。
// user_id の生値は返さず、先頭 8 桁（衝突時は延長）に置き換える。
import { supabaseAdmin } from "./_supabaseAdmin.js";
import { getEncryptionKey, decrypt } from "./_pii.js";
import { schoolCode } from "../src/lib/schools.js";

export type Ident = { school: string; grade?: number | null; cls?: number | null; num?: number | null };
export type UsageUser = { id: string } & Partial<Ident>;

/** 登録済みプロフィールを読み、学校コード＋年・組・番号へ復号する（鍵が無ければ学校コードだけ） */
export async function loadIdentities() {
  const profiles: Array<{ id: string; profile_enc: string | null; cohort: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,profile_enc,cohort")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`profiles: ${error.message}`);
    profiles.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

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
  return {
    profileIds: profiles.map((p) => p.id),
    identity,
    piiDecrypted: !!key,
    decryptFailed,
    schools: [...new Set(profiles.map((p) => schoolCode(p.cohort)))].sort(),
  };
}

/** 匿名 ID → index。users[index] は先頭 8 桁（衝突時は延長）＋登録済みなら学校コード・年・組・番号 */
export function makeUserIndex(identity: Map<string, Ident>) {
  const uidx = new Map<string, number>();
  const users: UsageUser[] = [];
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
  return { users, uOf };
}

// ---- 期間と絞り込み（usageAreas / usageStumbles 共通） ----------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" だけ通す */
export const dayParam = (raw: unknown) => {
  const s = typeof raw === "string" ? raw.trim() : "";
  return DAY.test(s) ? s : null;
};

/** JST の "YYYY-MM-DD" の 0 時を UTC の ISO に直す（shift 日ずらす） */
export const jstStartIso = (day: string, shift = 0) =>
  new Date(new Date(day + "T00:00:00Z").getTime() + shift * 864e5 - 9 * 3600e3).toISOString();

export type UsageFilter = { school: string | null; grade: number | null; cls: number | null };

const intParam = (raw: unknown) => {
  const n = typeof raw === "string" && /^\d{1,2}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** ?school=KU&grade=1&cls=3 （どれも省略可） */
export function parseUsageFilter(q: Record<string, unknown>): UsageFilter {
  const school = typeof q.school === "string" && /^[A-Z]{1,6}$/.test(q.school.trim()) ? q.school.trim() : null;
  return { school, grade: intParam(q.grade), cls: intParam(q.cls) };
}

/**
 * 集計に入れる生徒の user_id。登録済み（プロフィールがある）の生徒だけで、学校・年・組の条件に合う人。
 * 組・番号は暗号化されていて DB では絞れないので、ここで選んで DB 関数の p_users に渡す。
 */
export function pickUsers(identity: Map<string, Ident>, f: UsageFilter): string[] {
  const out: string[] = [];
  for (const [uid, x] of identity) {
    if (f.school && x.school !== f.school) continue;
    if (f.grade != null && x.grade !== f.grade) continue;
    if (f.cls != null && x.cls !== f.cls) continue;
    out.push(uid);
  }
  return out;
}

/** 学校・年・組ごとの登録人数（絞り込みの選択肢とクラス別の分母） */
export function buildRoster(identity: Map<string, Ident>) {
  const m = new Map<string, { school: string; grade: number | null; cls: number | null; registered: number }>();
  for (const x of identity.values()) {
    const grade = x.grade ?? null;
    const cls = x.cls ?? null;
    const k = `${x.school}|${grade}|${cls}`;
    const row = m.get(k) ?? { school: x.school, grade, cls, registered: 0 };
    row.registered++;
    m.set(k, row);
  }
  return [...m.values()].sort(
    (a, b) => a.school.localeCompare(b.school) || (a.grade ?? 99) - (b.grade ?? 99) || (a.cls ?? 99) - (b.cls ?? 99),
  );
}
