import { portraitForStage } from '@/lib/nobleData';

// 21 ステージのうち、現在の n に対応する水彩肖像を 1 枚で表示する。
// 8 帯ある原画から focusX/focusY で人物中心にトリミング、vignette と落款を重ねる。

type Props = {
  stageN: number;
  // 高さ (px)。幅は aspect で決まる。
  height?: number;
  // 幅/高さ。0.71 で縦長ポートレート、1.78 で 16:9 原画全体。
  aspect?: number;
  // 落款 (右上の朱印) を出すか。サムネ用途では false。
  showSeal?: boolean;
};

export default function WatercolorPortrait({
  stageN,
  height = 280,
  aspect = 0.71,
  showSeal = true,
}: Props) {
  const p = portraitForStage(stageN);
  const W = Math.round(height * aspect);
  const accent = p.palette[1];
  const deep = p.palette[2];

  return (
    <div
      style={{
        width: W,
        height,
        position: 'relative',
        overflow: 'hidden',
        background: '#f6efe0',
        boxShadow: '0 6px 14px rgba(60,40,20,0.16)',
      }}
    >
      <img
        src={p.src}
        alt={p.label}
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${p.focusX}% ${p.focusY}%`,
          pointerEvents: 'none',
        }}
      />

      {/* vignette: 人物の周辺を暗く落とし、肖像感を強める */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 80% 95% at 50% 55%, transparent 55%, ${deep}26 90%, ${deep}40 100%)`,
          pointerEvents: 'none',
        }}
      />

      {/* 水彩風の縁取り (mix-blend-multiply で原画に馴染ませる) */}
      <svg
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          mixBlendMode: 'multiply',
        }}
      >
        <path
          d="M 1 4 Q 50 1 99 5 L 99 136 Q 50 139 1 135 Z"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          strokeDasharray="0.4 0.6"
          opacity="0.35"
        />
      </svg>

      {showSeal && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 22,
            minHeight: 22,
            padding: '2px 4px',
            background: '#b8423a',
            color: '#fff',
            fontFamily: '"Shippori Mincho", "Noto Serif JP", serif',
            fontWeight: 800,
            fontSize: 10,
            lineHeight: 1.1,
            letterSpacing: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            writingMode: 'vertical-rl',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            transform: 'rotate(-3deg)',
          }}
          aria-label={`第${stageN}階`}
        >
          第{stageN}
        </div>
      )}
    </div>
  );
}
