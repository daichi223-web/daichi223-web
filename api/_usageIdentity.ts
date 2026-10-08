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
