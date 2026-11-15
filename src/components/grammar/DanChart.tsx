// 段の図：活用の種類ごとに、語尾が五十音のどの段を使うか（ア〜オを縦に並べ、使う段だけ色を付ける）。
// 名前のわけ（四段＝4つの段、上二段＝ウ段とその上のイ段 …）を目で見せる（2026-11-16、ユーザー指示）。
import { DANS, DAN_KANA, danChartRows, type Dan } from "@/lib/kobun/dan";

export function danStyle(d: Dan, solid = false) {
  return solid
    ? { background: `var(--dan-${d})`, color: "#fff" }
    : { background: `var(--dan-${d}-soft)`, color: `var(--dan-${d})` };
}

export function DanChart({ names }: { names: string[] }) {
  const rows = danChartRows(names);
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse" aria-label="活用の種類と使う段">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-[12px] font-black text-rw-ink-soft">種類</th>
            {DANS.map((d) => (
              <th key={d} className="px-1 py-1 text-center text-[12px] font-black" style={{ color: `var(--dan-${d})` }}>
                {DAN_KANA[d]}段
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-rw-rule">
              <td className="px-2 py-1 align-middle">
                <div className="font-black text-rw-ink whitespace-nowrap">{r.name}</div>
                <div className="text-[11px] leading-snug text-rw-ink-soft">{r.why}</div>
              </td>
              {DANS.map((d) => {
                const on = r.dans.includes(d);
                return (
                  <td key={d} className="px-1 py-1 text-center">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-black ${on ? "" : "text-rw-rule"}`}
                      style={on ? danStyle(d, true) : { border: "1px dashed var(--rw-rule)" }}
                      aria-label={on ? `${DAN_KANA[d]}段を使う` : `${DAN_KANA[d]}段は使わない`}
                    >
                      {on ? DAN_KANA[d] : ""}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
