import { useId } from 'react';
import type { QuizBackgroundColorId, QuizBackgroundId } from '../../lib/quizBackground';
import { QUIZ_BACKGROUND_COLORS } from '../../lib/quizBackground';

// 単語クイズ画面の和柄の背景。インライン SVG の <pattern> で描く（data URI では CSS 変数が使えないため）。
// 色は quizBackground.ts の淡い色（地と線の組。既定は生成り）。
// 青海波：R=18。周期 2R×2R のタイルに、半径 R・0.75R・0.5R・0.25R の円を y の小さい行から順に描く（下の行が上の行の下半分を隠して鱗になる）。
// 七宝　：R=22。周期 s=R√2 の正方タイルの4隅を中心に半径 R の円（線だけ）。
// 麻の葉：一辺 S=28 の正三角形の格子。各三角形の辺と、重心から3頂点への線。
// 亀甲　：半径 16 の六角形（頂点が上）を並べ、内側に 0.7 倍の六角形を重ねる。
// 市松　：一辺 14 の正方形を交互に塗る。
// 鱗　　：一辺 24 の正三角形を交互に塗る。
// 矢絣　：幅 14・高さ 28 の矢羽根（くの字の帯）を、列ごとに半分ずらして交互に塗る。

type Colors = { bg: string; line: string };
type PatternProps = { id: string; scale?: number; c: Colors };

// useId の値（":r1:" など）を id に使える形にする
const safeId = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '');
const tf = (scale: number) => (scale !== 1 ? `scale(${scale})` : undefined);
const pts = (p: Array<[number, number]>) => p.map(([x, y]) => `${x},${y}`).join(' ');

function SeigaihaPattern({ id, scale = 1, c }: PatternProps) {
  const R = 18;
  const centers: Array<[number, number]> = [
    [0, 0], [2 * R, 0],
    [-R, R], [R, R], [3 * R, R],
    [0, 2 * R], [2 * R, 2 * R],
  ];
  const radii = [R, 0.75 * R, 0.5 * R, 0.25 * R];
  return (
    <pattern id={id} width={2 * R} height={2 * R} patternUnits="userSpaceOnUse" patternTransform={tf(scale)}>
      <rect width={2 * R} height={2 * R} fill={c.bg} />
      {centers.map(([cx, cy], i) =>
        radii.map((r, j) => (
          <circle key={`${i}-${j}`} cx={cx} cy={cy} r={r} fill={c.bg} stroke={c.line} strokeWidth={1} />
        ))
      )}
    </pattern>
  );
}

function ShippoPattern({ id, scale = 1, c }: PatternProps) {
  const R = 22;
  const s = R * Math.SQRT2;
  const corners: Array<[number, number]> = [[0, 0], [s, 0], [0, s], [s, s]];
  return (
    <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse" patternTransform={tf(scale)}>
      <rect width={s} height={s} fill={c.bg} />
      {corners.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={c.line} strokeWidth={1} />
      ))}
    </pattern>
  );
}

function AsanohaPattern({ id, scale = 1, c }: PatternProps) {
  const S = 28;
  const h = (S * Math.sqrt(3)) / 2;
  // タイル [0,S]×[0,2h] を覆う正三角形
  const tris: Array<Array<[number, number]>> = [
    [[0, 0], [S, 0], [S / 2, h]],
    [[0, 0], [S / 2, h], [-S / 2, h]],
    [[S, 0], [3 * S / 2, h], [S / 2, h]],
    [[S / 2, h], [0, 2 * h], [S, 2 * h]],
    [[-S / 2, h], [S / 2, h], [0, 2 * h]],
    [[S / 2, h], [3 * S / 2, h], [S, 2 * h]],
  ];
  return (
    <pattern id={id} width={S} height={2 * h} patternUnits="userSpaceOnUse" patternTransform={tf(scale)}>
      <rect width={S} height={2 * h} fill={c.bg} />
      {tris.map((t, i) => {
        const gx = (t[0][0] + t[1][0] + t[2][0]) / 3;
        const gy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        return (
          <g key={i} stroke={c.line} strokeWidth={1} fill="none">
            <polygon points={pts(t)} />
            {t.map(([x, y], j) => <line key={j} x1={gx} y1={gy} x2={x} y2={y} />)}
          </g>
        );
      })}
    </pattern>
  );
}

function KikkoPattern({ id, scale = 1, c }: PatternProps) {
  const r = 16;
  const w = Math.sqrt(3) * r;
  const H = 3 * r;
  const hex = (cx: number, cy: number, k: number): Array<[number, number]> => [
    [cx, cy - r * k], [cx + (w / 2) * k, cy - (r / 2) * k], [cx + (w / 2) * k, cy + (r / 2) * k],
    [cx, cy + r * k], [cx - (w / 2) * k, cy + (r / 2) * k], [cx - (w / 2) * k, cy - (r / 2) * k],
  ];
  const centers: Array<[number, number]> = [[0, 0], [w, 0], [w / 2, 1.5 * r], [-w / 2, 1.5 * r], [3 * w / 2, 1.5 * r], [0, H], [w, H]];
  return (
    <pattern id={id} width={w} height={H} patternUnits="userSpaceOnUse" patternTransform={tf(scale)}>
      <rect width={w} height={H} fill={c.bg} />
      {centers.map(([cx, cy], i) => (
        <g key={i} stroke={c.line} strokeWidth={1} fill="none">
          <polygon points={pts(hex(cx, cy, 1))} />
          <polygon points={pts(hex(cx, cy, 0.7))} />
        </g>
      ))}
    </pattern>
  );
}

function IchimatsuPattern({ id, scale = 1, c }: PatternProps) {
  const a = 14;
  return (
    <pattern id={id} width={2 * a} height={2 * a} patternUnits="userSpaceOnUse" patternTransform={tf(scale)}>
      <rect width={2 * a} height={2 * a} fill={c.bg} />
      <rect x={0} y={0} width={a} height={a} fill={c.line} fillOpacity={0.55} />
      <rect x={a} y={a} width={a} height={a} fill={c.line} fillOpacity={0.55} />
    </pattern>
  );
}

function UrokoPattern({ id, scale = 1, c }: PatternProps) {
  const a = 24;
  const h = (a * Math.sqrt(3)) / 2;
  return (
    <pattern id={id} width={a} height={2 * h} patternUnits="userSpaceOnUse" patternTransform={tf(scale)}>
      <rect width={a} height={2 * h} fill={c.bg} />
      <g fill={c.line} fillOpacity={0.55}>
        <polygon points={pts([[0, h], [a, h], [a / 2, 0]])} />
        <polygon points={pts([[-a / 2, 2 * h], [a / 2, 2 * h], [0, h]])} />
        <polygon points={pts([[a / 2, 2 * h], [3 * a / 2, 2 * h], [a, h]])} />
      </g>
    </pattern>
  );
}

function YagasuriPattern({ id, scale = 1, c }: PatternProps) {
  const w = 14;
  const H = 28;
  const feather = (x: number, y: number): Array<[number, number]> => [
    [x, y], [x + w / 2, y + H * 0.35], [x + w, y], [x + w, y + H * 0.65], [x + w / 2, y + H], [x, y + H * 0.65],
  ];
  return (
    <pattern id={id} width={2 * w} height={2 * H} patternUnits="userSpaceOnUse" patternTransform={tf(scale)}>
      <rect width={2 * w} height={2 * H} fill={c.bg} />
      <g fill={c.line} fillOpacity={0.6}>
        <polygon points={pts(feather(0, 0))} />
        <polygon points={pts(feather(0, 2 * H))} />
        <polygon points={pts(feather(w, H))} />
        <polygon points={pts(feather(w, -H))} />
      </g>
    </pattern>
  );
}

const PATTERNS: Record<QuizBackgroundId, (p: PatternProps) => JSX.Element> = {
  seigaiha: SeigaihaPattern,
  shippo: ShippoPattern,
  asanoha: AsanohaPattern,
  kikko: KikkoPattern,
  ichimatsu: IchimatsuPattern,
  uroko: UrokoPattern,
  yagasuri: YagasuriPattern,
};

function colorsOf(color: QuizBackgroundColorId): Colors {
  return QUIZ_BACKGROUND_COLORS[color] ?? QUIZ_BACKGROUND_COLORS.kinari;
}

function PatternDefs({ pattern, color, id, scale }: { pattern: QuizBackgroundId; color: QuizBackgroundColorId; id: string; scale?: number }) {
  const P = PATTERNS[pattern] ?? SeigaihaPattern;
  return <P id={id} scale={scale} c={colorsOf(color)} />;
}

/** 画面全体に敷く背景。中身は relative z-[1] で上に出す */
export function QuizBackground({ pattern, color = 'kinari' }: { pattern: QuizBackgroundId; color?: QuizBackgroundColorId }): JSX.Element {
  const id = `qbg-${pattern}-${color}-${safeId(useId())}`;
  return (
    <svg
      key={`${pattern}-${color}`}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
    >
      <defs>
        <PatternDefs pattern={pattern} color={color} id={id} />
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** 設定の見本（QuizLookSettings）。同じ pattern を小さな枠に描く。scale で柄を縮めて繰り返しを増やせる */
export function PatternSwatch({
  pattern,
  color = 'kinari',
  width,
  height,
  scale = 1,
  className,
}: {
  pattern: QuizBackgroundId;
  color?: QuizBackgroundColorId;
  width: number;
  height: number;
  scale?: number;
  className?: string;
}): JSX.Element {
  const id = `qsw-${pattern}-${color}-${safeId(useId())}`;
  return (
    <svg
      key={`${pattern}-${color}`}
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: 'block' }}
    >
      <defs>
        <PatternDefs pattern={pattern} color={color} id={id} scale={scale} />
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>
  );
}

export default QuizBackground;
