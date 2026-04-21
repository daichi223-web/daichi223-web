// api/deleteAllData.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_firebaseAdmin.js";
import { requireStaff } from "./_requireStaff.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireStaff(req);

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { confirm } = req.body;

    if (confirm !== "DELETE_ALL_DATA") {
      return res.status(400).json({
        error: "確認用キーワードが必要です。body に { confirm: 'DELETE_ALL_DATA' } を送信してください。"
      });
    }

    // 削除するコレクション
    const collections = ["answers", "candidates", "overrides"];
    const deleted: { [key: string]: number } = {};

    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).get();
      const docs = snapshot.docs;
      let count = 0;

      // Firestore batches are limited to 500 operations
      for (let i = 0; i < docs.length; i += 500) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + 500);
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        count += chunk.length;
      }

      deleted[collectionName] = count;
    }

    return res.json({
      ok: true,
      message: "全データを削除しました",
      deleted,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    res.status(msg.includes("PERMISSION_DENIED") ? 403 : 500).json({ error: msg });
  }
}
