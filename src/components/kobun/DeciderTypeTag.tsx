import { DECIDER_TYPES } from '@/lib/kobun/vocabIndexList';

/**
 * 決め手の型の札（呼応・共起語・対象・視点・場面・つき方・活用の形・決まった形）。
 * 単語一覧の「見分け方」と単語カードの「意味の見分け方」で使う（2026-11-15 見本）。
 * 長押し・ホバーで型の説明（title）。
 */
export function DeciderTypeTag({ type }: { type?: string }) {
  if (!type) return null;
  return (
    <span
      title={DECIDER_TYPES[type]}
      className="inline-block align-[1px] mr-1 text-[10px] font-black leading-none px-1.5 py-[3px] rounded border"
      style={{ color: 'var(--rw-ink)', borderColor: 'var(--rw-ink)', background: 'var(--rw-paper)' }}
    >
      {type}
    </span>
  );
}
