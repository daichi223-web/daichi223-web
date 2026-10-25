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
  /** 画面上の固定ヘッダなどに重ねないための余白（月の琴は本文の枠の上端より上に出さない） */
  avoidTop?: number;
  /** 指で操作中は上を優先（指と手で隠れないように） */
  preferAbove?: boolean;
  /** 今出ている側（below）。スクロールで語について動くとき、その側に入るうちは側を変えない（月の琴はスクロール中は語との位置関係を保つ） */
  current?: boolean;
  margin?: number;
}
export interface Placement {
  left: number;
  top: number;
  below: boolean;
  arrowLeft: number;
}

/**
 * 語の上か下に置く。カードは本来の高さのまま出す（縮めて中をスクロールさせない。2026-10-25 ユーザー指示「スクロールじゃない方がいい」）。
 * - 指で操作中（preferAbove）：上に入り切れば上（指と手で隠れないように）。入り切らなければ下に入り切れば下。
 *   どちらにも入り切らないときは月の琴と同じ：上に画面の3割以上の余地があれば上端で止めて出す（語に少し被る）、無ければ下
 * - マウス：下に入れば下、入らなければ上、どちらにも入らなければ広いほう
 * - 追従中（current）：今の側に入り切るうちは側を変えない（語をまたいで飛ばない）
 */
export function placeCard(i: PlaceInput): Placement {
  const m = i.margin ?? 8, gap = 10, arrow = 7;
  const T = i.avoidTop ?? 0;
  const W = i.viewport.width, H = i.viewport.height - (i.avoidBottom ?? 0);
  const { width: w, height: h } = i.size;
  const r = i.rect;
  const pt = i.point ?? null;
  // 月の琴と同じ：指の点が語の枠の中（±4px）にあれば語の枠を、外なら指の点のまわりを基準にする（スクロール直後は枠の座標が古いことがある）
  const inR = !!pt && pt.x >= r.left - 4 && pt.x <= r.right + 4 && pt.y >= r.top - 4 && pt.y <= r.bottom + 4;
  const cx = pt ? pt.x : (r.left + r.right) / 2;
  const aTop = pt && !inR ? pt.y - 14 : r.top, aBot = pt && !inR ? pt.y + 14 : r.bottom;
  // 語に被らずに使える高さ（上：固定ヘッダ＋余白から語まで、下：語から帯＋余白まで）
  const roomAbove = aTop - gap - (T + m), roomBelow = H - m - aBot - gap;
  const fitsAbove = roomAbove >= h, fitsBelow = roomBelow >= h;
  let below: boolean;
  if (i.current !== undefined && (i.current ? fitsBelow : fitsAbove)) below = i.current;
  else if (i.preferAbove) below = fitsAbove ? false : fitsBelow ? true : roomAbove < Math.min(h, (H - T) * 0.3);
  else below = fitsBelow || (!fitsAbove && roomBelow >= roomAbove);
  let top = below ? aBot + gap : aTop - gap - h;
  top = Math.max(T + m, Math.min(top, H - h - m));
  const left = Math.max(m, Math.min(cx - w / 2, W - w - m));
  const arrowLeft = Math.max(14, Math.min(cx - left - arrow, w - 28));
  return { left, top, below, arrowLeft };
}
