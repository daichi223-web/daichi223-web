/**
 * 浮かぶ解説カード（WordCard）の、DOM に依存しない計算。
 * - touchMode: 指の動き始めの向きから「なぞり」か「スクロール」かを決める（横書きなので横がなぞり）
 * - tapOutcome: タップで固定するか閉じるか
 * - placeCard: カードを語の上か下に置き、画面の中に収める
 */

export type TouchMode = "scrub" | "pan" | null;

/** 動き始めの向き。6px 未満はまだ決めない */
export function touchMode(dx: number, dy: number, threshold = 6): TouchMode {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? "scrub" : "pan";
}

/** 動かさずに離した（タップ）とき：語の外→閉じる、固定中の同じ語→閉じる、それ以外→固定 */
export function tapOutcome(tappedId: string | null, pinnedBefore: string | null): "close" | "pin" {
  if (!tappedId) return "close";
  if (pinnedBefore === tappedId) return "close";
  return "pin";
}

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface PlaceInput {
  /** 語の枠（画面座標） */
  rect: Rect;
  /** 指やマウスの点。無ければ語の中央 */
  point?: { x: number; y: number } | null;
  /** カードの大きさ */
  size: { width: number; height: number };
  /** 画面の大きさ */
  viewport: { width: number; height: number };
  /** 画面下の帯などに重ねないための余白 */
  avoidBottom?: number;
  /** 指で操作中は上を優先（指と手で隠れないように） */
  preferAbove?: boolean;
  margin?: number;
}
export interface Placement { left: number; top: number; below: boolean; arrowLeft: number }

export function placeCard(i: PlaceInput): Placement {
  const m = i.margin ?? 8, gap = 10, arrow = 7;
  const W = i.viewport.width, H = i.viewport.height - (i.avoidBottom ?? 0);
  const { width: w, height: h } = i.size;
  const r = i.rect;
  const cx = i.point ? i.point.x : (r.left + r.right) / 2;
  const roomBelow = H - r.bottom - gap, roomAbove = r.top - gap;
  const below = i.preferAbove ? roomAbove < Math.min(h, H * 0.3) : roomBelow >= h || roomBelow >= roomAbove;
  let top = below ? r.bottom + gap : r.top - h - gap;
  top = Math.max(m, Math.min(top, H - h - m));
  const left = Math.max(m, Math.min(cx - w / 2, W - w - m));
  const arrowLeft = Math.max(14, Math.min(cx - left - arrow, w - 28));
  return { left, top, below, arrowLeft };
}
