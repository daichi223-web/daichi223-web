import type { CSSProperties } from 'react';
import type { PortraitTone } from './portraitTone';
import { MIYABI_PORTRAITS_READY } from './nobleData';

// 位階の肖像（public/portraits、4:3）から「顔」を丸く切り出すための表。
// nobleData.ts の PORTRAITS の focusX/focusY（object-position 用、全件 50/50）とは別の概念で、ここでは中心と大きさを持つ。
//
// cx, cy = 顔の中心（鼻のあたり）の位置。画像の幅・高さに対する %。
// d      = 頭全体（冠・髪の上端〜あご）が収まる円の直径。画像の幅に対する %。
//
// 値は 2026-11-02 に public/portraits/{stage,yuru-stage,pop-stage}-NN-w480.webp（480×360）を測ったもの（小数1桁）。
// cx = 鼻の x px / 480、cy = 鼻の y px / 360、d = (あご − 頭頂) px / 480。精度は ±3px（0.6〜0.8 ポイント）。
// 画風の中央値（欠け・外れ値を補うときの既定）：sharp (49.2, 18.9, 14.8) / yuru (48.2, 37.4, 28.3) / pop (50.4, 19.2, 15.6)。
// 中心が鼻で d が頭頂〜あごなので、鼻を中心に d で切ると冠・烏帽子の上端は欠ける（LINE のアイコンと同じで顔を大きく見せる割り切り）。
// 冠まで入れたいときは cy を頭の中心に寄せるか d を広げる。測り方・直し方は docs/quiz-chat-feedback.md §5。

export type FaceFocus = { cx: number; cy: number; d: number };

export const STAGE_COUNT = 21;

/** 画風 × 第 n 階（index = n-1）の顔の位置 */
export const PORTRAIT_FACES: Record<PortraitTone, FaceFocus[]> = {
  // くっきり（写実の水彩・全身立像）。第1階だけ座像で顔が低い（冠なし）。第4・11・12階は細い纓が真上に立ち、d に含めている
  sharp: [
    { cx: 51.0, cy: 26.7, d: 15.0 }, // 第1階 無位
    { cx: 48.5, cy: 18.3, d: 12.5 }, // 第2階 八位
    { cx: 48.8, cy: 19.2, d: 12.9 }, // 第3階 七位
    { cx: 47.9, cy: 19.2, d: 14.2 }, // 第4階 従六下
    { cx: 48.3, cy: 18.9, d: 14.8 }, // 第5階 従六上
    { cx: 52.1, cy: 19.4, d: 16.0 }, // 第6階 正六下
    { cx: 46.3, cy: 18.3, d: 15.2 }, // 第7階 正六上
    { cx: 50.0, cy: 15.6, d: 13.3 }, // 第8階 従五下
    { cx: 51.3, cy: 18.9, d: 15.2 }, // 第9階 従五上
    { cx: 50.2, cy: 17.5, d: 15.0 }, // 第10階 正五下
    { cx: 50.0, cy: 18.9, d: 15.2 }, // 第11階 正五上
    { cx: 47.3, cy: 20.3, d: 15.2 }, // 第12階 従四下
    { cx: 48.5, cy: 16.7, d: 14.2 }, // 第13階 従四上
    { cx: 47.9, cy: 18.9, d: 14.4 }, // 第14階 正四下
    { cx: 49.2, cy: 17.8, d: 14.8 }, // 第15階 正四上
    { cx: 49.4, cy: 19.2, d: 15.0 }, // 第16階 従三
    { cx: 49.2, cy: 18.9, d: 14.8 }, // 第17階 正三
    { cx: 49.2, cy: 18.6, d: 15.4 }, // 第18階 従二
    { cx: 47.9, cy: 20.6, d: 14.8 }, // 第19階 正二
    { cx: 49.6, cy: 18.6, d: 15.4 }, // 第20階 従一
    { cx: 49.8, cy: 17.5, d: 14.8 }, // 第21階 正一
  ],
  // ゆるキャラ×史実（ちび体型）。第9・14・21階は長い纓・簪を d に含めたので大きい
  yuru: [
    { cx: 47.8, cy: 30.3, d: 23.3 }, // 第1階 無位
    { cx: 49.1, cy: 40.0, d: 30.6 }, // 第2階 八位
    { cx: 50.6, cy: 37.4, d: 25.4 }, // 第3階 七位
    { cx: 49.0, cy: 39.9, d: 31.0 }, // 第4階 従六下
    { cx: 48.9, cy: 38.3, d: 30.0 }, // 第5階 従六上
    { cx: 48.2, cy: 42.2, d: 31.0 }, // 第6階 正六下
    { cx: 48.1, cy: 35.2, d: 28.3 }, // 第7階 正六上
    { cx: 48.2, cy: 36.0, d: 25.4 }, // 第8階 従五下
    { cx: 47.2, cy: 42.4, d: 33.8 }, // 第9階 従五上
    { cx: 48.9, cy: 38.7, d: 29.6 }, // 第10階 正五下
    { cx: 49.8, cy: 33.0, d: 27.9 }, // 第11階 正五上
    { cx: 47.1, cy: 35.3, d: 26.9 }, // 第12階 従四下
    { cx: 49.0, cy: 35.2, d: 27.3 }, // 第13階 従四上
    { cx: 49.1, cy: 40.3, d: 33.3 }, // 第14階 正四下
    { cx: 47.3, cy: 30.6, d: 26.0 }, // 第15階 正四上
    { cx: 47.1, cy: 38.9, d: 31.5 }, // 第16階 従三
    { cx: 49.1, cy: 32.1, d: 25.6 }, // 第17階 正三
    { cx: 48.2, cy: 33.9, d: 28.3 }, // 第18階 従二
    { cx: 47.2, cy: 34.6, d: 26.0 }, // 第19階 正二
    { cx: 49.1, cy: 37.7, d: 31.5 }, // 第20階 従一
    { cx: 47.0, cy: 40.8, d: 34.2 }, // 第21階 正一
  ],
  // ポップ（動きのある姿勢）。第14・15・18階は立った纓を d に含めている（本体だけなら 9.4〜10.8）
  pop: [
    { cx: 49.4, cy: 17.2, d: 11.9 }, // 第1階 無位
    { cx: 50.0, cy: 18.1, d: 13.8 }, // 第2階 八位
    { cx: 50.4, cy: 16.4, d: 13.5 }, // 第3階 七位
    { cx: 46.3, cy: 19.7, d: 16.5 }, // 第4階 従六下
    { cx: 49.0, cy: 18.6, d: 15.2 }, // 第5階 従六上
    { cx: 49.4, cy: 21.1, d: 16.9 }, // 第6階 正六下
    { cx: 51.0, cy: 18.6, d: 15.4 }, // 第7階 正六上
    { cx: 50.6, cy: 20.3, d: 14.6 }, // 第8階 従五下
    { cx: 50.2, cy: 20.6, d: 16.5 }, // 第9階 従五上
    { cx: 52.1, cy: 19.2, d: 16.7 }, // 第10階 正五下
    { cx: 51.7, cy: 18.9, d: 15.4 }, // 第11階 正五上
    { cx: 47.3, cy: 18.3, d: 15.4 }, // 第12階 従四下
    { cx: 49.0, cy: 18.6, d: 14.8 }, // 第13階 従四上
    { cx: 50.8, cy: 19.2, d: 16.7 }, // 第14階 正四下
    { cx: 52.1, cy: 16.9, d: 14.8 }, // 第15階 正四上
    { cx: 51.0, cy: 19.4, d: 17.7 }, // 第16階 従三
    { cx: 53.3, cy: 20.0, d: 16.3 }, // 第17階 正三
    { cx: 47.1, cy: 18.6, d: 15.6 }, // 第18階 従二
    { cx: 50.4, cy: 20.6, d: 16.9 }, // 第19階 正二
    { cx: 50.0, cy: 21.1, d: 16.0 }, // 第20階 従一
    { cx: 50.6, cy: 21.4, d: 17.3 }, // 第21階 正一
  ],
  // みやび（Codex 作、2026-11-13）。public/portraits/miyabi-stage-NN-w480.webp を格子で拡大して目で測った（鼻・冠の上端・あご）。
  // 全身立像で頭が小さめ（d≒13）。第1階は髷で冠なし
  miyabi: [
    { cx: 50.5, cy: 14.5, d: 11.3 }, // 第1階 無位
    { cx: 50.5, cy: 15.0, d: 12.0 }, // 第2階 八位
    { cx: 51.0, cy: 14.0, d: 12.0 }, // 第3階 七位
    { cx: 50.2, cy: 16.0, d: 13.1 }, // 第4階 従六下
    { cx: 50.5, cy: 15.0, d: 12.8 }, // 第5階 従六上
    { cx: 50.5, cy: 16.0, d: 13.1 }, // 第6階 正六下
    { cx: 50.5, cy: 16.0, d: 13.5 }, // 第7階 正六上
    { cx: 50.5, cy: 15.5, d: 13.1 }, // 第8階 従五下
    { cx: 50.3, cy: 15.0, d: 12.8 }, // 第9階 従五上
    { cx: 50.5, cy: 15.5, d: 13.1 }, // 第10階 正五下
    { cx: 50.5, cy: 15.0, d: 13.1 }, // 第11階 正五上
    { cx: 50.3, cy: 15.5, d: 13.1 }, // 第12階 従四下
    { cx: 50.0, cy: 16.0, d: 13.1 }, // 第13階 従四上
    { cx: 50.5, cy: 16.0, d: 13.5 }, // 第14階 正四下
    { cx: 50.5, cy: 16.0, d: 13.9 }, // 第15階 正四上
    { cx: 50.5, cy: 16.0, d: 13.5 }, // 第16階 従三
    { cx: 50.0, cy: 16.0, d: 13.5 }, // 第17階 正三
    { cx: 50.3, cy: 16.0, d: 13.5 }, // 第18階 従二
    { cx: 50.3, cy: 16.0, d: 13.9 }, // 第19階 正二
    { cx: 50.5, cy: 16.0, d: 13.5 }, // 第20階 従一
    { cx: 50.0, cy: 16.5, d: 13.9 }, // 第21階 正一
  ],
};

/** 第 n 階の顔の位置。範囲外（0 以下・22 以上・整数でない）は index 0 */
export function faceFor(tone: PortraitTone, n: number): FaceFocus {
  // 肖像の絵として実際に出す画風（みやびの肖像が無い設定のときは sharp の絵なので、顔の位置も sharp）
  const drawn = tone === 'miyabi' && !MIYABI_PORTRAITS_READY ? 'sharp' : tone;
  const list = PORTRAIT_FACES[drawn] ?? PORTRAIT_FACES.sharp;
  const index = Number.isInteger(n) && n >= 1 && n <= list.length ? n - 1 : 0;
  return list[index];
}

/**
 * 正方形 boxPx の枠（overflow hidden・border-radius 50%）に <img> を absolute で置く計算。
 * aspect = 画像の幅/高さ（肖像は 4/3）。fill = 頭の直径を枠の何割にするか（既定 0.8）。
 * 表示幅 W = boxPx × fill × 100 / d、表示高さ H = W / aspect、left = boxPx/2 − W×cx/100、top = boxPx/2 − H×cy/100。
 * transform ではなく left/top で置く（WebKit で丸い枠の角が切れない対策）。
 */
export function faceImgStyle(
  face: FaceFocus,
  boxPx: number,
  opts?: { aspect?: number; fill?: number; noseAt?: number }
): CSSProperties {
  const aspect = opts?.aspect && opts.aspect > 0 ? opts.aspect : 4 / 3;
  // 既定 0.74：頭（冠の上端〜あご）を枠の 74% にする。
  // noseAt 既定 0.6：顔の中心（鼻）を枠の上から 60% の位置に置く。鼻は頭の中心より下にあるので、
  // 枠の中心に鼻を置くと冠・烏帽子の上端が欠ける（2026-11-02 の一覧で確認）。
  const fill = opts?.fill && opts.fill > 0 ? opts.fill : 0.74;
  const noseAt = opts?.noseAt && opts.noseAt > 0 ? opts.noseAt : 0.6;
  const d = face.d > 0 ? face.d : 100;
  const W = (boxPx * fill * 100) / d;
  const H = W / aspect;
  const left = boxPx / 2 - (W * face.cx) / 100;
  const top = boxPx * noseAt - (H * face.cy) / 100;
  return { position: 'absolute', width: W, height: H, left, top, maxWidth: 'none' };
}
