// 文法ドリルの例文の描画（2026-11-15 に DrillSession から切り出した。レッスンでも同じ見た目で使う）。

/**
 * 例文の描画。【 】＝問われている語（赤太字）、《 》＝意味・活用を決める手がかり（下線）。
 * どこと呼応して意味を形成しているかを視覚的に示す。
 */
export function renderDrillContext(text: string, showCues: boolean) {
  const parts = text.split(/(【[^】]*】|《[^》]*》)/);
  return parts.map((p, i) => {
    if (p.startsWith("【")) {
      return (
        <span key={i} className="font-black text-rw-primary px-0.5 border-b-4" style={{ borderColor: "var(--rw-primary)" }}>
          {p.slice(1, -1)}
        </span>
      );
    }
    if (p.startsWith("《")) {
      if (!showCues) return <span key={i}>{p.slice(1, -1)}</span>;
      return (
        <span key={i} className="font-bold text-rw-accent underline decoration-2 underline-offset-4">
          {p.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
