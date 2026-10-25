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
  /** この側で語に被らずに使える高さ。カードの max-height にし、入り切らない中身はカードの中でスクロールさせる */
  maxHeight: number;
}

/**
 * 使い物になる最小の高さ：語の行＋意味の行＋理由の2行ほどが見える 160px（画面が狭ければ3割、ただし 120px は確保）。
 * カード全体がそれより低ければカードの高さ。月の琴の「上に3割以上あれば上」より低めなのは、縮めても中をスクロールできるため
 */
export function minUsableHeight(cardHeight: number, usableScreen: number): number {
  return Math.min(cardHeight, Math.max(120, Math.min(160, usableScreen * 0.3)));
}

/**
 * 語の上か下に置く。**カードは語に被せない**：選んだ側に入り切らないときは、その側で使える高さまで縮めて中をスクロールさせる。
 * - 指で操作中（preferAbove）：上を優先（指と手で隠れないように）。上に最小の高さが取れないときだけ下
 * - マウス：下に入れば下、入らなければ上、どちらにも入らなければ広いほう
 * - 追従中（current）：今の側に最小の高さが取れるうちは側を変えず、高さだけ変える（語をまたいで飛ばない）
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
  const minH = minUsableHeight(h, H - T);
  let below: boolean;
  if (i.current !== undefined && (i.current ? roomBelow : roomAbove) >= minH) below = i.current;
  else if (i.preferAbove) below = roomAbove < minH && roomBelow > roomAbove;
  else below = roomBelow >= h || (roomAbove < h && roomBelow >= roomAbove);
  const room = below ? roomBelow : roomAbove;
  const maxHeight = Math.max(96, room); // 画面が極端に狭いときの下限（このときだけ語に被る）
  const hh = Math.min(h, maxHeight);
  let top = below ? aBot + gap : aTop - gap - hh;
  top = Math.max(T + m, Math.min(top, H - hh - m));
  const left = Math.max(m, Math.min(cx - w / 2, W - w - m));
  const arrowLeft = Math.max(14, Math.min(cx - left - arrow, w - 28));
  return { left, top, below, arrowLeft, maxHeight };
}
