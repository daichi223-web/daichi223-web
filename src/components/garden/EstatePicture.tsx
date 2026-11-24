// 読解の庭の院の絵（2026-11-24）。土台＝荒れた院、よみがえった所＝その所の物の形で切った層を重ねる。
// どこの所にも入らない地面と木（ground）は、よみがえった所の数／11 の濃さで重ねる（全体が少しずつよみがえる）。
// 切り分けの設計 F:\A2A\_work\kobun-garden\design\partial-restore-design.md
// 絵は Canva で生成（設計 F:\A2A\_work\kobun-garden\design\estate-design.md v2.1＝国語便覧の寝殿造の図にならった理想の邸）。
// 層の位置と押せる範囲は assets-src/garden/make_estate.py が書き出す src/lib/gardenEstateLayers.ts。
import type { EstateKey } from '@/lib/garden';
import { ESTATE_HIT, ESTATE_HIT_ORDER, ESTATE_LAYERS, ESTATE_SIZE } from '@/lib/gardenEstateLayers';

const BASE = '/garden/estate/';
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

// 「次はここ」の札は、その所でいちばん大きな範囲の中央に出す
function labelAt(polys: number[][][]): [number, number] {
  let best = polys[0];
  let bestArea = -1;
  for (const p of polys) {
    const xs = p.map((q) => q[0]);
    const ys = p.map((q) => q[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) { best = p; bestArea = area; }
  }
  const xs = best.map((q) => q[0]);
  const ys = best.map((q) => q[1]);
  return [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
}

export default function EstatePicture({
  restored, next, names, onPick,
}: {
  restored: ReadonlySet<EstateKey>;
  next: EstateKey | null;
  names: Record<EstateKey, string>;
  onPick: (key: EstateKey) => void;
}) {
  const { w: W, h: H } = ESTATE_SIZE;
  const label = next ? labelAt(ESTATE_HIT[next]) : null;
  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${W} / ${H}` }}>
      <img src={`${BASE}ruined.webp`} alt="荒れた院" className="absolute inset-0 w-full h-full" draggable={false} />
      {restored.size > 0 && (
        <img
          src={`${BASE}ground.webp`}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute"
          style={{
            left: pct(ESTATE_LAYERS.ground.x, W), top: pct(ESTATE_LAYERS.ground.y, H),
            width: pct(ESTATE_LAYERS.ground.w, W), height: pct(ESTATE_LAYERS.ground.h, H),
            opacity: Math.min(1, restored.size / ESTATE_HIT_ORDER.length), transition: 'opacity .9s ease-out',
          }}
        />
      )}
      {ESTATE_HIT_ORDER.filter((k) => restored.has(k as EstateKey)).map((k) => {
        const L = ESTATE_LAYERS[k];
        return (
          <img
            key={k}
            src={`${BASE}${k}.webp`}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute garden-estate-layer"
            style={{ left: pct(L.x, W), top: pct(L.y, H), width: pct(L.w, W), height: pct(L.h, H) }}
          />
        );
      })}
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="院の絵" className="absolute inset-0 w-full h-full">
        {ESTATE_HIT_ORDER.map((k) => {
          const key = k as EstateKey;
          const ok = restored.has(key);
          return (
            <g
              key={key}
              role="button"
              tabIndex={0}
              aria-label={`${names[key]}（${ok ? 'よみがえった' : 'まだ荒れている'}）`}
              data-part={key}
              className="garden-estate-hit"
              onClick={() => onPick(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(key);
                }
              }}
            >
              {ESTATE_HIT[key].map((p, i) => (
                <polygon key={i} points={p.map((q) => q.join(',')).join(' ')} />
              ))}
            </g>
          );
        })}
        {next && label && (
          <g pointerEvents="none">
            {ESTATE_HIT[next].map((p, i) => (
              <polygon key={i} points={p.map((q) => q.join(',')).join(' ')} fill="none" stroke="#fdfaf5" strokeWidth={3} strokeDasharray="10 8" />
            ))}
            <rect x={label[0] - 105} y={label[1] - 32} width={210} height={64} rx={32} fill="#fdfaf5" stroke="#9a8c7c" strokeWidth={3} strokeDasharray="8 6" opacity={0.95} />
            <text x={label[0]} y={label[1] + 14} textAnchor="middle" fontSize={40} fontWeight={800} fill="#5c5249">次はここ</text>
          </g>
        )}
      </svg>
    </div>
  );
}
