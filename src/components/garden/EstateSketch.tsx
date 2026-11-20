// 読解の庭の院（仮の絵）。図形で描いた見取り図で、Codex の院の絵（依頼A＝荒れた院・よみがえった院の2枚＋切り分けの型）が
// 届いたら、その絵を重ねる形に差し替える（F:\A2A\_work\kobun-garden\BRIEF-codex.md）。
// 形は見本 F:\A2A\_work\kobun-garden\mock.html の邸の図から。上が北、下（手前）が南の池。
// よみがえった所は色つき、荒れた所は色を抜いて薄く描く。
import type { EstateKey } from '@/lib/garden';

const C = {
  roof: '#6e5b4d', ridge: '#4f4036', floor: '#d8c3a0', sand: '#efe6d3', water: '#9cc3cf', waterDeep: '#7aaab9',
  wall: '#cbb894', soil: '#b89a72', leaf: '#7fae6e', bridge: '#b5452f', island: '#9fbf86', pine: '#5f8f55',
};

function roof(x: number, y: number, w: number, h: number, inset?: number): string {
  const r = inset ?? Math.min(w, h) * 0.42;
  const cy = y + h / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${C.roof}"/>` +
    `<path d="M${x} ${y} L${x + r} ${cy} L${x + w - r} ${cy} L${x + w} ${y} M${x} ${y + h} L${x + r} ${cy} M${x + w - r} ${cy} L${x + w} ${y + h}" stroke="${C.ridge}" stroke-width="1.2" fill="none"/>` +
    `<rect x="${x}" y="${y + h}" width="${w}" height="4" fill="${C.floor}"/>`;
}
function corridor(x1: number, y1: number, x2: number, y2: number, wd = 7): string {
  if (y1 === y2) return `<rect x="${Math.min(x1, x2)}" y="${y1 - wd / 2}" width="${Math.abs(x2 - x1)}" height="${wd}" fill="${C.roof}" opacity=".85"/>`;
  return `<rect x="${x1 - wd / 2}" y="${Math.min(y1, y2)}" width="${wd}" height="${Math.abs(y2 - y1)}" fill="${C.roof}" opacity=".85"/>`;
}
const STREAM = 'M338 18 C318 40 344 60 322 82 C300 104 336 122 312 142 C296 156 300 166 292 176';

const PART_SVG: Record<EstateKey, string> = {
  tsuiji: `<rect x="8" y="8" width="344" height="226" rx="6" fill="none" stroke="${C.wall}" stroke-width="5"/><rect x="346" y="120" width="12" height="26" fill="#fdfaf5"/><path d="M344 118 h16 M344 148 h16" stroke="${C.roof}" stroke-width="4"/>`,
  shinden: roof(126, 58, 108, 46),
  nishi: roof(30, 68, 66, 38) + corridor(96, 84, 126, 84, 6),
  higashi: roof(264, 68, 66, 38) + corridor(234, 84, 264, 84, 9),
  ike: `<rect x="70" y="118" width="220" height="34" rx="6" fill="${C.sand}"/><path d="M60 182 C70 150 130 152 180 156 C240 150 300 152 308 180 C312 208 250 222 180 220 C110 222 52 210 60 182Z" fill="${C.water}"/><path d="M90 196 C130 206 230 208 280 194" stroke="${C.waterDeep}" stroke-width="1.5" fill="none" opacity=".6"/>`,
  yarimizu: `<path d="${STREAM}" stroke="${C.water}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="${STREAM}" stroke="${C.waterDeep}" stroke-width="1.2" fill="none" stroke-dasharray="3 5" opacity=".7"/>`,
  senzai: [[112, 114], [246, 114], [300, 60], [318, 108], [40, 120], [100, 140], [262, 140]]
    .map(([x, y], i) => {
      const c = ['#c98fb0', '#e8c341', '#d9566f', '#7fae6e'][i % 4];
      return `<circle cx="${x}" cy="${y}" r="6" fill="${C.leaf}"/><circle cx="${x - 2}" cy="${y - 2}" r="2" fill="${c}"/><circle cx="${x + 3}" cy="${y}" r="1.8" fill="${c}"/>`;
    })
    .join('') + `<path d="M18 112 h40 M18 116 h40" stroke="${C.wall}" stroke-width="1.2" stroke-dasharray="2 2"/>`,
  nakajima: `<ellipse cx="182" cy="192" rx="26" ry="10" fill="${C.island}"/><circle cx="176" cy="188" r="4" fill="${C.pine}"/><path d="M182 156 Q170 170 180 183" stroke="${C.bridge}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M188 201 L196 220" stroke="${C.floor}" stroke-width="4"/>`,
  kita: roof(146, 18, 68, 30) + corridor(180, 48, 180, 58, 8),
  chumon: corridor(312, 106, 312, 160, 7) + `<rect x="305" y="128" width="14" height="10" fill="${C.ridge}"/>`,
  tsuridono: corridor(52, 106, 52, 160, 6) + roof(34, 160, 40, 22, 10),
};
// 下に描くものが先（池 → 建物）
const DRAW_ORDER: EstateKey[] = ['tsuiji', 'ike', 'yarimizu', 'nakajima', 'senzai', 'kita', 'shinden', 'nishi', 'higashi', 'chumon', 'tsuridono'];
// 「次はここ」の札の位置
const LABEL_AT: Record<EstateKey, [number, number]> = {
  tsuiji: [300, 228], shinden: [180, 81], nishi: [63, 87], higashi: [297, 87], ike: [130, 190], yarimizu: [322, 80],
  senzai: [112, 108], nakajima: [182, 212], kita: [180, 33], chumon: [312, 170], tsuridono: [54, 198],
};

export default function EstateSketch({
  restored, next, names, onPick,
}: {
  restored: ReadonlySet<EstateKey>;
  next: EstateKey | null;
  names: Record<EstateKey, string>;
  onPick: (key: EstateKey) => void;
}) {
  return (
    <svg viewBox="0 0 360 242" role="group" aria-label="院の見取り図" className="block w-full h-auto">
      <rect x="12" y="12" width="336" height="218" rx="4" fill={C.soil} opacity={0.22} />
      {DRAW_ORDER.map((k) => {
        const ok = restored.has(k);
        return (
          <g
            key={k}
            role="button"
            tabIndex={0}
            aria-label={`${names[k]}（${ok ? 'よみがえった' : 'まだ荒れている'}）`}
            data-part={k}
            onClick={() => onPick(k)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(k);
              }
            }}
            style={ok ? { cursor: 'pointer' } : { cursor: 'pointer', opacity: 0.38, filter: 'grayscale(1) sepia(0.35)' }}
            dangerouslySetInnerHTML={{ __html: PART_SVG[k] }}
          />
        );
      })}
      {next && (() => {
        const [x, y] = LABEL_AT[next];
        return (
          <g pointerEvents="none">
            <rect x={x - 26} y={y - 9} width={52} height={18} rx={9} fill="#fdfaf5" stroke="#9a8c7c" strokeDasharray="3 3" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#7a6f64">次はここ</text>
          </g>
        );
      })()}
      <text x={350} y={240} textAnchor="end" fontSize={8} fill="#7a6f64">北↑</text>
    </svg>
  );
}
