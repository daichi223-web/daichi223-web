// 学習履歴のエクスポート / インポート。
// localStorage の進捗・設定 + Supabase の word_stats / srs_state を JSON 1ファイルにまとめ、
// 別端末・ブラウザリセット・OS 移行時の保険にする。
//
// JSON 形式:
//   {
//     version: 1,
//     exportedAt: "2026-05-10T12:34:56.789Z",
//     userId: "auth.uid 文字列",
//     localStorage: { "<key>": "<value(string)>", ... },
//     server: {
//       wordStats: [{ qid, correct, incorrect, last_seen }, ...],
//       srsState:  [{ qid, box, ease, due_at, last_reviewed_at }, ...],
//     },
//   }

import { supabase } from './supabase';
import { currentAuthUid } from './anonAuth';
import { EXPORTABLE_KEYS } from './storageKeys';

export const BACKUP_VERSION = 1;

export type BackupFile = {
  version: number;
  exportedAt: string;
  userId: string | null;
  localStorage: Record<string, string>;
  server: {
    wordStats: Array<Record<string, unknown>>;
    srsState: Array<Record<string, unknown>>;
  };
};

function readLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of EXPORTABLE_KEYS) {
    try {
      const v = localStorage.getItem(key);
      if (v != null) out[key] = v;
    } catch {
      // private mode 等で失敗。skip
    }
  }
  return out;
}

async function readServerData(userId: string | null) {
  if (!userId) return { wordStats: [], srsState: [] };
  const [ws, srs] = await Promise.all([
    supabase.from('word_stats').select('qid, correct, incorrect, last_seen').eq('user_id', userId),
    supabase.from('srs_state').select('qid, box, next_review, last_review').eq('user_id', userId),
  ]);
  return {
    wordStats: ws.data ?? [],
    srsState: srs.data ?? [],
  };
}

export async function exportAll(): Promise<BackupFile> {
  const userId = await currentAuthUid();
  const ls = readLocalStorage();
  const server = await readServerData(userId);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    userId,
    localStorage: ls,
    server,
  };
}

export async function downloadBackup(): Promise<void> {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `kobun-tan-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ImportResult = {
  ok: boolean;
  message: string;
  applied: {
    localStorageKeys: number;
    wordStatsRows: number;
    srsStateRows: number;
  };
};

function isBackupFile(o: unknown): o is BackupFile {
  if (!o || typeof o !== 'object') return false;
  const x = o as Record<string, unknown>;
  return (
    typeof x.version === 'number'
    && typeof x.exportedAt === 'string'
    && (x.userId === null || typeof x.userId === 'string')
    && typeof x.localStorage === 'object' && x.localStorage != null
    && typeof x.server === 'object' && x.server != null
  );
}

/**
 * 学習履歴を JSON ファイルから復元する。
 * - localStorage: 既存値を上書き
 * - Supabase: 現在の auth.uid に対して upsert (RLS により自分のデータのみ書き込み可)
 *
 * 注意: 別ユーザーの userId が含まれていてもサーバ側は現在の auth.uid に rekey してインポートする。
 */
export async function importBackup(file: BackupFile): Promise<ImportResult> {
  if (!isBackupFile(file)) {
    return { ok: false, message: 'バックアップファイルの形式が不正です。', applied: { localStorageKeys: 0, wordStatsRows: 0, srsStateRows: 0 } };
  }
  if (file.version !== BACKUP_VERSION) {
    return { ok: false, message: `未対応のバックアップバージョンです (file=${file.version}, app=${BACKUP_VERSION})`, applied: { localStorageKeys: 0, wordStatsRows: 0, srsStateRows: 0 } };
  }

  // localStorage 復元 (許可リスト経由なので任意の key は注入されない)
  let lsCount = 0;
  const allowed = new Set(EXPORTABLE_KEYS);
  for (const [k, v] of Object.entries(file.localStorage)) {
    if (!allowed.has(k)) continue;
    if (typeof v !== 'string') continue;
    try {
      localStorage.setItem(k, v);
      lsCount += 1;
    } catch {
      // quota や private mode で失敗
    }
  }

  // Supabase 復元 (現在の auth.uid に upsert)
  const userId = await currentAuthUid();
  let wsCount = 0;
  let srsCount = 0;
  if (userId) {
    if (Array.isArray(file.server?.wordStats) && file.server.wordStats.length > 0) {
      const rows = file.server.wordStats.map((r) => ({
        user_id: userId,
        qid: String(r.qid ?? ''),
        correct: Number(r.correct ?? 0),
        incorrect: Number(r.incorrect ?? 0),
        last_seen: typeof r.last_seen === 'string' ? r.last_seen : new Date().toISOString(),
      })).filter((r) => r.qid);
      const { error } = await supabase.from('word_stats').upsert(rows, { onConflict: 'user_id,qid' });
      if (!error) wsCount = rows.length;
    }
    if (Array.isArray(file.server?.srsState) && file.server.srsState.length > 0) {
      const rows = file.server.srsState.map((r) => ({
        user_id: userId,
        qid: String(r.qid ?? ''),
        box: Number(r.box ?? 1),
        next_review: typeof r.next_review === 'string' ? r.next_review : new Date().toISOString(),
        last_review: typeof r.last_review === 'string' ? r.last_review : null,
      })).filter((r) => r.qid);
      const { error } = await supabase.from('srs_state').upsert(rows, { onConflict: 'user_id,qid' });
      if (!error) srsCount = rows.length;
    }
  }

  return {
    ok: true,
    message: `復元しました (localStorage: ${lsCount}件 / word_stats: ${wsCount}件 / srs_state: ${srsCount}件)`,
    applied: {
      localStorageKeys: lsCount,
      wordStatsRows: wsCount,
      srsStateRows: srsCount,
    },
  };
}

export async function importBackupFromFile(file: File): Promise<ImportResult> {
  let parsed: unknown;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSON のパースに失敗しました。', applied: { localStorageKeys: 0, wordStatsRows: 0, srsStateRows: 0 } };
  }
  return importBackup(parsed as BackupFile);
}
