import { useState, type CSSProperties } from 'react';
import { portraitForStage } from '@/lib/nobleData';
import type { PortraitTone } from '@/lib/portraitTone';
import { faceFor, faceImgStyle, faceThumbSrc } from '@/lib/portraitFaces';

// 丸い顔アイコン。
// - stageN / tone：位階の肖像から顔だけを切り出した小さい画像（128px、public/portraits/face/。scripts/build-portrait-faces.py）を、
//   そのまま丸に入れる（位置合わせの CSS は要らない）。無い・読めないときは従来どおり w1200 の肖像から portraitFaces の表で切る。
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
  const [failedThumb, setFailedThumb] = useState<string | null>(null);
  const candidate = 'src' in props ? null : faceThumbSrc(props.tone, props.stageN);
  const thumb = candidate && candidate !== failedThumb ? candidate : null;

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
    'src' in props || thumb
      ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }
      : { ...faceImgStyle(faceFor(props.tone, props.stageN), size), pointerEvents: 'none' };

  const src = 'src' in props ? props.src : (thumb ?? portraitForStage(props.stageN, props.tone).src);

  return (
    <span className={className} style={outer}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        // 小さい顔画像（5KB 前後）は会話の中で遅れて出ないよう lazy にしない。先生の絵・大きい肖像は今までどおり
        loading={thumb ? undefined : 'lazy'}
        decoding="async"
        onError={thumb ? () => setFailedThumb(thumb) : undefined}
        style={img}
      />
    </span>
  );
}

export default FaceAvatar;
