import { useRef, useState } from 'react';
import { downloadBackup, importBackupFromFile, type ImportResult } from '@/lib/backup';

// 学習履歴のエクスポート/インポート UI。/stats ページに置く。
// - エクスポート: ボタンで JSON ダウンロード
// - インポート: ファイル選択 → 確認 → upsert → リロード推奨

export default function BackupSection() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);

  const onExport = async () => {
    if (busy) return;
    setBusy('export');
    setMsg(null);
    try {
      await downloadBackup();
      setMsg('ダウンロードしました。安全な場所に保管してください。');
    } catch (e) {
      console.error(e);
      setMsg('エクスポートに失敗しました。');
    } finally {
      setBusy(null);
    }
  };

  const onImportClick = () => {
    if (busy) return;
    fileRef.current?.click();
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを再選択できるように
    if (!file) return;
    if (!confirm(
      `「${file.name}」を読み込みます。\n` +
      `現在の学習履歴 (localStorage + サーバ word_stats / srs_state) が上書きされます。\n` +
      `続けますか？`,
    )) return;

    setBusy('import');
    setMsg(null);
    setImported(null);
    try {
      const result = await importBackupFromFile(file);
      setImported(result);
      if (result.ok) {
        setMsg(result.message + ' 反映のため画面をリロードします。');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMsg('インポート失敗: ' + result.message);
      }
    } catch (err) {
      console.error(err);
      setMsg('インポート中にエラー: ' + (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-6">
      <h2 className="text-xs font-black tracking-wider text-rw-ink-soft uppercase mb-2">
        学習履歴のバックアップ
      </h2>
      <div className="bg-rw-paper border border-rw-rule rounded-2xl p-4">
        <p className="text-[11px] text-rw-ink-soft leading-relaxed mb-3">
          単語クイズの正答記録、SRS の進行、ストリーク、単語帳、読解進捗をまとめて
          JSON でダウンロード／復元できます。<br />
          別端末への移行や、ブラウザデータを消す前の保険にどうぞ。
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={busy !== null}
            className="py-2.5 px-3 rounded-xl bg-rw-ink text-rw-paper text-sm font-bold disabled:opacity-50"
          >
            {busy === 'export' ? '書き出し中…' : '📥 エクスポート'}
          </button>
          <button
            type="button"
            onClick={onImportClick}
            disabled={busy !== null}
            className="py-2.5 px-3 rounded-xl bg-rw-paper border-2 border-rw-ink text-rw-ink text-sm font-bold disabled:opacity-50"
          >
            {busy === 'import' ? '復元中…' : '📤 インポート'}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onImportFile}
        />

        {msg && (
          <div
            className={`mt-3 text-xs leading-relaxed p-2.5 rounded-xl border ${
              imported?.ok === false ? 'bg-rw-primary-soft border-rw-primary text-rw-primary' : 'bg-rw-accent-soft border-rw-accent text-rw-ink'
            }`}
          >
            {msg}
          </div>
        )}
      </div>
    </section>
  );
}
