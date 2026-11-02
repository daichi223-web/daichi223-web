import type { CSSProperties } from 'react';
import { portraitForStage } from '@/lib/nobleData';
import type { PortraitTone } from '@/lib/portraitTone';
import { faceFor, faceImgStyle } from '@/lib/portraitFaces';

// 丸い顔アイコン。
// - stageN / tone：位階の肖像（w1200。顔を 6〜7 倍に拡大するので w480 では粗い）から、portraitFaces の表で顔を切り出す。
// - src：先生の絵（public/teachers、正方形）を objectFit cover で等倍に入れる。
// 外側は overflow hidden の円。img は transform を使わず left/top で置く（WebKit で角が丸く切れない対策）。

type Common = {
  size: number;
  alt: string;
  className?: string;
  /** 既定 true: 2px の --rw-ink 枠（box-shadow なので枠の内側の大きさは変わらない） */
  ring?: boolean;
};

type Props = Common & ({ stageN: number; tone: PortraitTone } | { src: string });

export function FaceAvatar(props: Props): JSX.Element {
  const { size, alt, className, ring = true } = props;

  const outer: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
    position: 'relative',
    background: 'var(--rw-bg)',
    flexShrink: 0,
    isolation: 'isolate',
    ...(ring ? { boxShadow: '0 0 0 2px var(--rw-ink)' } : {}),
  };

  const img: CSSProperties =
    'src' in props
      ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }
      : { ...faceImgStyle(faceFor(props.tone, props.stageN), size), pointerEvents: 'none' };

  const src = 'src' in props ? props.src : portraitForStage(props.stageN, props.tone).src;

  return (
    <span className={className} style={outer}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={img}
      />
    </span>
  );
}

export default FaceAvatar;
