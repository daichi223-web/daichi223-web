import { useId } from 'react';
import type { QuizBackgroundId } from '../../lib/quizBackground';

// 単語クイズ画面の和柄の背景。インライン SVG の <pattern> で描く（data URI では CSS 変数が使えないため）。
// 色は --rw-* のテーマ変数なので、テーマを替えると線の色も付いてくる。
// 青海波：R=18。周期 2R×2R のタイルに、半径 R・0.75R・0.5R・0.25R の円を y の小さい行から順に描く（下の行が上の行の下半分を隠して鱗になる）。
// 七宝　：R=22。周期 s=R√2 の正方タイルの4隅を中心に半径 R の円（線だけ）。

const SEIGAIHA_R = 18;
const SHIPPO_R = 22;

// useId の値（":r1:" など）を id に使える形にする
const safeId = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '');

function SeigaihaPattern({ id, scale = 1 }: { id: string; scale?: number }) {
  const R = SEIGAIHA_R;
  // 行ごとに y の小さい順。同じ行の中では x の順
  const centers: Array<[number, number]> = [
    [0, 0], [2 * R, 0],
    [-R, R], [R, R], [3 * R, R],
    [0, 2 * R], [2 * R, 2 * R],
  ];
  const radii = [R, 0.75 * R, 0.5 * R, 0.25 * R];
  return (
    <pattern
      id={id}
      width={2 * R}
      height={2 * R}
      patternUnits="userSpaceOnUse"
      patternTransform={scale !== 1 ? `scale(${scale})` : undefined}
    >
      {centers.map(([cx, cy], i) =>
        radii.map((r, j) => (
          <circle
            key={`${i}-${j}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="var(--rw-bg)"
            stroke="var(--rw-rule)"
            strokeWidth={1}
          />
        ))
      )}
    </pattern>
  );
}

function ShippoPattern({ id, scale = 1 }: { id: string; scale?: number }) {
  const R = SHIPPO_R;
  const s = R * Math.SQRT2;
  const corners: Array<[number, number]> = [[0, 0], [s, 0], [0, s], [s, s]];
  return (
    <pattern
      id={id}
      width={s}
      height={s}
      patternUnits="userSpaceOnUse"
      patternTransform={scale !== 1 ? `scale(${scale})` : undefined}
    >
      {corners.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke="var(--rw-primary)"
          strokeOpacity={0.16}
          strokeWidth={1}
        />
      ))}
    </pattern>
  );
}

function PatternDefs({ pattern, id, scale }: { pattern: QuizBackgroundId; id: string; scale?: number }) {
  return pattern === 'shippo' ? <ShippoPattern id={id} scale={scale} /> : <SeigaihaPattern id={id} scale={scale} />;
}

/** 画面全体に敷く背景。親（クイズ画面の最外 div）は background: var(--rw-bg) にし、中身を relative z-[1] で上に出す */
export function QuizBackground({ pattern }: { pattern: QuizBackgroundId }): JSX.Element {
  const id = `qbg-${pattern}-${safeId(useId())}`;
  return (
    <svg
      key={pattern}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
    >
      <defs>
        <PatternDefs pattern={pattern} id={id} />
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** 設定の見本（QuizLookSettings）。同じ pattern を小さな枠に描く。scale で柄を縮めて繰り返しを増やせる */
export function PatternSwatch({
  pattern,
  width,
  height,
  scale = 1,
  className,
}: {
  pattern: QuizBackgroundId;
  width: number;
  height: number;
  scale?: number;
  className?: string;
}): JSX.Element {
  const id = `qsw-${pattern}-${safeId(useId())}`;
  return (
    <svg
      key={pattern}
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: 'block', background: 'var(--rw-bg)' }}
    >
      <defs>
        <PatternDefs pattern={pattern} id={id} scale={scale} />
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>
  );
}

export default QuizBackground;
