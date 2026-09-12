// Server-only: 個人情報の暗号化ユーティリティ（health-check の Edge Function `pii` と同じ方式を Node に移植）。
//   * AES-GCM 256bit。鍵は PII_ENCRYPTION_KEY（64 桁 hex）を Vercel の env に置く
//   * 暗号文は base64(iv(12byte) + ciphertext)。iv は毎回ランダム
//   * 照合用ハッシュは sha256(lower(text)) の hex。SQL の encode(digest(lower(x),'sha256'),'hex') と一致する
// 鍵を失うと復号できない。鍵の値はログにもレスポンスにも出さない。
import { webcrypto } from "crypto";

const subtle = webcrypto.subtle;

export async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = process.env.PII_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("PII_ENCRYPTION_KEY must be 64-char hex");
  }
  const keyBytes = Buffer.from(keyHex, "hex");
  return subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return Buffer.from(combined).toString("base64");
}

/** 復号。壊れている・鍵が違う場合は null（平文フォールバックはしない：この表は最初から暗号化のみ） */
export async function decrypt(ciphertextB64: string, key: CryptoKey): Promise<string | null> {
  try {
    const combined = Buffer.from(ciphertextB64, "base64");
    if (combined.length <= 12) return null;
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);
    const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function sha256hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text.toLowerCase());
  const hash = await subtle.digest("SHA-256", encoded);
  return Buffer.from(hash).toString("hex");
}
