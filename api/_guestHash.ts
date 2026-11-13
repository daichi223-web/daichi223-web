// お試し（ゲスト）のパスワードの正規化とハッシュ（DB に触れない純関数。テストからも読む）。使うのは api/_guest.ts。
import { scryptSync } from "node:crypto";

const KEYLEN = 32;

/** 照合の前の正規化：NFKC（全角→半角）と前後の空白を落とす */
export function normalizeGuestPassword(raw: unknown): string {
  return typeof raw === "string" ? raw.normalize("NFKC").trim() : "";
}

/** scrypt（N=16384, r=8, p=1, 32バイト）。salt は16進 */
export function hashGuestPassword(password: string, saltHex: string): string {
  return scryptSync(password, Buffer.from(saltHex, "hex"), KEYLEN).toString("hex");
}
