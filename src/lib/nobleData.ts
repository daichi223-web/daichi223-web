// 貴族版「装束×位階」データモデル。handoff/kizoku/data.js を TS 化。
import type { PortraitTone } from './portraitTone';
// 21 ステージ × 5 部位 (頭/袍/裾/持物/帯) で平安官人の出世を表現する。

export type PartKey = 'head' | 'robe' | 'train' | 'item' | 'belt';

export type Tier = '地下' | '殿上人' | '公卿' | '極位';

export type PartLevels = Record<PartKey, number>;

// パーツ Lv の上限。partLevelFromPct() の正規化で使う。
// (具体的な per-stage の見た目は各 STAGE.display を参照)
export const PART_MAX_LV: PartLevels = { head: 7, robe: 9, train: 5, item: 5, belt: 5 };

export const PART_LABEL: Record<PartKey, string> = {
  head: '頭', robe: '袍', train: '裾', item: '持物', belt: '帯',
};

// 21 階位ごとの各部位の正式名称 (平安後期の臣下装束を基準)。
// 平安後期は「上位ほど紫」ではなく、五位=緋、六位以下=縹、四位以上=黒が基本。
export type StageDisplay = {
  head: string;
  robe: string;
  train: string;
  item: string;
  belt: string;
};

export type Stage = {
  n: number;
  rank: string;
  post: string;
  era: Tier;
  head: number;
  robe: number;
  train: number;
  item: number;
  belt: number;
  display: StageDisplay;
  milestone?: Tier; // 節目 (殿上人/公卿/極位デビュー)
  apex?: boolean;
};

export const STAGES: Stage[] = [
  { n: 1,  rank: '無位',   post: '雑任',                head: 1, robe: 1, train: 1, item: 1, belt: 1, era: '地下',
    display: { head: '髷',                robe: '白水干',         train: 'なし',       item: '紙',                belt: 'なし' } },
  { n: 2,  rank: '八位',   post: '少録',                head: 2, robe: 2, train: 1, item: 1, belt: 1, era: '地下',
    display: { head: '折烏帽子',          robe: '縹',             train: 'なし',       item: '紙',                belt: 'なし' } },
  { n: 3,  rank: '七位',   post: '大允',                head: 2, robe: 3, train: 1, item: 2, belt: 1, era: '地下',
    display: { head: '折烏帽子',          robe: '縹(濃)',          train: 'なし',       item: '木笏',              belt: 'なし' } },
  { n: 4,  rank: '従六下', post: '下国守',              head: 3, robe: 4, train: 2, item: 2, belt: 2, era: '地下',
    display: { head: '立烏帽子',          robe: '縹',             train: '短',         item: '木笏',              belt: '平緒' } },
  { n: 5,  rank: '従六上', post: '上国介',              head: 3, robe: 5, train: 2, item: 2, belt: 2, era: '地下',
    display: { head: '立烏帽子',          robe: '縹(濃)',          train: '短',         item: '木笏',              belt: '平緒' } },
  { n: 6,  rank: '正六下', post: '中国守',              head: 3, robe: 5, train: 2, item: 3, belt: 2, era: '地下',
    display: { head: '立烏帽子',          robe: '縹(綾)',          train: '短',         item: '木笏+紙扇',         belt: '平緒' } },
  { n: 7,  rank: '正六上', post: '大国介・大丞',        head: 4, robe: 5, train: 2, item: 3, belt: 2, era: '地下',
    display: { head: '立烏帽子(紋付)',    robe: '縹(地紋)',        train: '短',         item: '木笏+紙扇',         belt: '平緒' } },
  { n: 8,  rank: '従五下', post: '上国守・少納言',      head: 5, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人', milestone: '殿上人',
    display: { head: '冠(短纓)',          robe: '緋',             train: '中',         item: '笏+檜扇',            belt: '細太刀(黒漆)' } },
  { n: 9,  rank: '従五上', post: '大国守・侍従',        head: 5, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人',
    display: { head: '冠(纓中)',          robe: '緋(綾)',          train: '中',         item: '笏+檜扇',            belt: '細太刀' } },
  { n: 10, rank: '正五下', post: '少弁・近衛少将',      head: 6, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '黒',             train: '中',         item: '笏+檜扇',            belt: '細太刀' } },
  { n: 11, rank: '正五上', post: '中弁・大判事',        head: 6, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '黒(地紋)',        train: '中',         item: '笏+檜扇',            belt: '細太刀' } },
  { n: 12, rank: '従四下', post: '八省輔・近衛中将',    head: 6, robe: 7, train: 4, item: 4, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '黒',             train: '長',         item: '笏+檜扇',            belt: '飾太刀' } },
  { n: 13, rank: '従四上', post: '京大夫・大宰大弐',    head: 6, robe: 7, train: 4, item: 4, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '黒(綾)',          train: '長',         item: '笏+檜扇',            belt: '飾太刀' } },
  { n: 14, rank: '正四下', post: '七省卿・参議',        head: 6, robe: 7, train: 4, item: 5, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '黒(地紋)',        train: '長',         item: '笏+蒔絵檜扇',        belt: '飾太刀' } },
  { n: 15, rank: '正四上', post: '中務卿・左右大弁',    head: 6, robe: 7, train: 4, item: 5, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '黒(上質地紋)',    train: '長',         item: '笏+蒔絵檜扇',        belt: '飾太刀' } },
  { n: 16, rank: '従三',   post: '中納言・大宰帥',      head: 7, robe: 8, train: 4, item: 5, belt: 4, era: '公卿', milestone: '公卿',
    display: { head: '冠(高位垂纓)',      robe: '黒(公卿綾)',      train: '長',         item: '笏+蒔絵檜扇',        belt: '飾太刀' } },
  { n: 17, rank: '正三',   post: '大納言',              head: 7, robe: 8, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(高位垂纓)',      robe: '黒(綾)',          train: '最長',       item: '笏+檜扇',            belt: '飾太刀' } },
  { n: 18, rank: '従二',   post: '内大臣',              head: 7, robe: 8, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(極位垂纓)',      robe: '黒(上質地紋)',    train: '最長',       item: '笏+檜扇',            belt: '飾太刀' } },
  { n: 19, rank: '正二',   post: '左大臣・右大臣',      head: 7, robe: 8, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(極位垂纓)',      robe: '黒(有文)',        train: '最長',       item: '笏+檜扇',            belt: '飾太刀' } },
  { n: 20, rank: '従一',   post: '摂政・関白',          head: 7, robe: 9, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(極位)',          robe: '黒(上質有文)',    train: '最長',       item: '笏+檜扇',            belt: '飾太刀' } },
  { n: 21, rank: '正一',   post: '太政大臣',            head: 7, robe: 9, train: 5, item: 5, belt: 5, era: '極位', milestone: '極位', apex: true,
    display: { head: '冠(極位)',          robe: '黒(最高級有文)',  train: '最長',       item: '笏+檜扇',            belt: '飾太刀' } },
];

// 袍 (robe) の色名先頭一致で代表色を返す。平安後期の臣下の位袍を基準にする。
export function robeColorOf(robeName: string): string {
  if (robeName.startsWith('白'))    return '#f3ecdc';
  if (robeName.startsWith('縹'))    return '#536f86';
  if (robeName.startsWith('緋'))    return '#a83e32';
  if (robeName.startsWith('黒'))    return '#26262a';
  return 'var(--rw-ink-soft)';
}

// 章 (ch1-5) と部位の対応 + クイズ動線情報。
// kobun-tan の「Key&Point 古文単語330」5 章にマッピング。
export type Genre = {
  id: 'A' | 'B' | 'C' | 'D' | 'E';
  chapterId: 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5';
  kanji: string;
  name: string;
  short: string;
  part: PartKey;
  cap: number;
  color: string;
};

export const GENRES: Genre[] = [
  { id: 'A', chapterId: 'ch1', kanji: '読', name: '読解必修語', short: '読解', part: 'head',  cap: 7, color: '#8b6f3a' },
  { id: 'B', chapterId: 'ch2', kanji: '必', name: '入試必修語', short: '必修', part: 'robe',  cap: 9, color: '#b8423a' },
  { id: 'C', chapterId: 'ch3', kanji: '敬', name: '最重要敬語', short: '敬語', part: 'train', cap: 5, color: '#4a2a5c' },
  { id: 'D', chapterId: 'ch4', kanji: '重', name: '入試重要語', short: '重要', part: 'item',  cap: 5, color: '#2e4d6b' },
  { id: 'E', chapterId: 'ch5', kanji: '攻', name: '入試攻略語', short: '攻略', part: 'belt',  cap: 5, color: '#2e5c3a' },
];

// 21 枚の水彩ポートレート。各ステージを1枚ずつ固有に表現する。
// focusX/focusY は object-position (%) — 人物が中心になるトリミング基準。
export type PortraitBand = {
  /** 主表示用 (幅1200px)。原画は約2800pxでスマホが落ちるため直接参照しない */
  src: string;
  /** 一覧・小枠用 (幅480px) */
  thumb: string;
  fromN: number;
  toN: number;
  label: string;
  note: string;
  focusX: number;
  focusY: number;
  palette: [string, string, string];
};

export const PORTRAITS: PortraitBand[] = [
  { src: '/portraits/stage-01-w1200.webp', thumb: '/portraits/stage-01-w480.webp', fromN: 1, toN: 1, label: '無位 ・ 雑任', note: '白水干・巻物・文机', focusX: 50, focusY: 50, palette: ['#e8dfcb', '#a89473', '#554431'] },
  { src: '/portraits/stage-02-w1200.webp', thumb: '/portraits/stage-02-w480.webp', fromN: 2, toN: 2, label: '八位 ・ 少録', note: '濃い縹の袍・折烏帽子・木笏', focusX: 50, focusY: 50, palette: ['#a9c0cd', '#536f86', '#293b4b'] },
  { src: '/portraits/stage-03-w1200.webp', thumb: '/portraits/stage-03-w480.webp', fromN: 3, toN: 3, label: '七位 ・ 大允', note: '縹の袍・木笏・紙を置いた文机', focusX: 50, focusY: 50, palette: ['#a9c0cd', '#536f86', '#293b4b'] },
  { src: '/portraits/stage-04-w1200.webp', thumb: '/portraits/stage-04-w480.webp', fromN: 4, toN: 4, label: '従六下 ・ 下国守', note: '縹の袍・立烏帽子・短い平緒', focusX: 50, focusY: 50, palette: ['#a9c0cd', '#536f86', '#293b4b'] },
  { src: '/portraits/stage-05-w1200.webp', thumb: '/portraits/stage-05-w480.webp', fromN: 5, toN: 5, label: '従六上 ・ 上国介', note: '濃い縹の袍・硯箱・平緒', focusX: 50, focusY: 50, palette: ['#a9c0cd', '#536f86', '#293b4b'] },
  { src: '/portraits/stage-06-w1200.webp', thumb: '/portraits/stage-06-w480.webp', fromN: 6, toN: 6, label: '正六下 ・ 中国守', note: '縹の綾袍・紙扇・文箱', focusX: 50, focusY: 50, palette: ['#a9c0cd', '#536f86', '#293b4b'] },
  { src: '/portraits/stage-07-w1200.webp', thumb: '/portraits/stage-07-w480.webp', fromN: 7, toN: 7, label: '正六上 ・ 大国介', note: '縹の地紋袍・紋付き立烏帽子', focusX: 50, focusY: 50, palette: ['#a9c0cd', '#536f86', '#293b4b'] },
  { src: '/portraits/stage-08-w1200.webp', thumb: '/portraits/stage-08-w480.webp', fromN: 8, toN: 8, label: '従五下 ・ 殿上人初位', note: '緋袍・短纓冠・檜扇・細太刀', focusX: 50, focusY: 50, palette: ['#dc7763', '#a83e32', '#5c201b'] },
  { src: '/portraits/stage-09-w1200.webp', thumb: '/portraits/stage-09-w480.webp', fromN: 9, toN: 9, label: '従五上 ・ 侍従', note: '緋の綾袍・纓・銀の硯箱', focusX: 50, focusY: 50, palette: ['#dc7763', '#a83e32', '#5c201b'] },
  { src: '/portraits/stage-10-w1200.webp', thumb: '/portraits/stage-10-w480.webp', fromN: 10, toN: 10, label: '正五下 ・ 少弁', note: '緋の上質袍・垂纓冠・文書台', focusX: 50, focusY: 50, palette: ['#dc7763', '#a83e32', '#5c201b'] },
  { src: '/portraits/stage-11-w1200.webp', thumb: '/portraits/stage-11-w480.webp', fromN: 11, toN: 11, label: '正五上 ・ 中弁', note: '緋の地紋袍・垂纓冠・飾り御簾', focusX: 50, focusY: 50, palette: ['#dc7763', '#a83e32', '#5c201b'] },
  { src: '/portraits/stage-12-w1200.webp', thumb: '/portraits/stage-12-w480.webp', fromN: 12, toN: 12, label: '従四下 ・ 八省輔', note: '黒袍・垂纓冠・長い下襲・飾太刀', focusX: 50, focusY: 50, palette: ['#aaa9a5', '#26262a', '#111114'] },
  { src: '/portraits/stage-13-w1200.webp', thumb: '/portraits/stage-13-w480.webp', fromN: 13, toN: 13, label: '従四上 ・ 京大夫', note: '黒の綾袍・垂纓冠・金具の硯箱', focusX: 50, focusY: 50, palette: ['#aaa9a5', '#26262a', '#111114'] },
  { src: '/portraits/stage-14-w1200.webp', thumb: '/portraits/stage-14-w480.webp', fromN: 14, toN: 14, label: '正四下 ・ 七省卿', note: '黒の地紋袍・蒔絵檜扇・屏風', focusX: 50, focusY: 50, palette: ['#aaa9a5', '#26262a', '#111114'] },
  { src: '/portraits/stage-15-w1200.webp', thumb: '/portraits/stage-15-w480.webp', fromN: 15, toN: 15, label: '正四上 ・ 中務卿', note: '黒の上質地紋袍・几帳・文箱', focusX: 50, focusY: 50, palette: ['#aaa9a5', '#26262a', '#111114'] },
  { src: '/portraits/stage-16-w1200.webp', thumb: '/portraits/stage-16-w480.webp', fromN: 16, toN: 16, label: '従三 ・ 中納言', note: '公卿の黒袍有文・高位垂纓冠', focusX: 50, focusY: 50, palette: ['#aaa7a0', '#26262a', '#101014'] },
  { src: '/portraits/stage-17-w1200.webp', thumb: '/portraits/stage-17-w480.webp', fromN: 17, toN: 17, label: '正三 ・ 大納言', note: '精緻な有文袍・香炉・上質檜扇', focusX: 50, focusY: 50, palette: ['#aaa7a0', '#26262a', '#101014'] },
  { src: '/portraits/stage-18-w1200.webp', thumb: '/portraits/stage-18-w480.webp', fromN: 18, toN: 18, label: '従二 ・ 内大臣', note: '高級有文袍・蒔絵文箱・香炉', focusX: 50, focusY: 50, palette: ['#aaa7a0', '#26262a', '#101014'] },
  { src: '/portraits/stage-19-w1200.webp', thumb: '/portraits/stage-19-w480.webp', fromN: 19, toN: 19, label: '正二 ・ 左右大臣', note: '極上有文袍・格式ある廂・調度品', focusX: 50, focusY: 50, palette: ['#aaa7a0', '#26262a', '#101014'] },
  { src: '/portraits/stage-20-w1200.webp', thumb: '/portraits/stage-20-w480.webp', fromN: 20, toN: 20, label: '従一 ・ 摂政関白', note: '最高級黒袍・極位冠・重厚な屏風', focusX: 50, focusY: 50, palette: ['#aaa7a0', '#26262a', '#101014'] },
  { src: '/portraits/stage-21-w1200.webp', thumb: '/portraits/stage-21-w480.webp', fromN: 21, toN: 21, label: '正一位 ・ 太政大臣', note: '最高位の黒い有文束帯・最高級の御簾', focusX: 50, focusY: 50, palette: ['#aaa7a0', '#26262a', '#101014'] },
];

// 部位ごとの解説図 (StatsPage の図解で使う)
export const PART_CHARTS: Array<{ key: PartKey; label: string; src: string; thumb: string; cap: number }> = [
  { key: 'head',  label: '頭 ・ 烏帽子の七段',   src: '/portraits/chart-head-w1200.webp', thumb: '/portraits/chart-head-w480.webp',  cap: 7 },
  { key: 'robe',  label: '袍 ・ 色目の九段',     src: '/portraits/chart-robe-w1200.webp', thumb: '/portraits/chart-robe-w480.webp',  cap: 9 },
  { key: 'train', label: '裾 ・ 下襲の五段',     src: '/portraits/chart-train-w1200.webp', thumb: '/portraits/chart-train-w480.webp', cap: 5 },
  { key: 'item',  label: '持物 ・ 笏と扇の五段', src: '/portraits/chart-item-w1200.webp', thumb: '/portraits/chart-item-w480.webp',  cap: 5 },
  { key: 'belt',  label: '帯 ・ 太刀の五段',     src: '/portraits/chart-belt-w1200.webp', thumb: '/portraits/chart-belt-w480.webp',  cap: 5 },
];

// 現在のパーツ Lv が全て満たす最高ステージ。
export function effectiveStage(parts: PartLevels): Stage {
  let best = STAGES[0];
  for (const s of STAGES) {
    if (parts.head >= s.head && parts.robe >= s.robe && parts.train >= s.train &&
        parts.item >= s.item && parts.belt >= s.belt) {
      best = s;
    }
  }
  return best;
}

// 次ステージ + 阻害している部位 (Lv不足)。
export function nextStage(parts: PartLevels, currentN: number):
  | null
  | { stage: Stage; blocking: Array<{ part: PartKey; label: string; have: number; need: number }> } {
  if (currentN >= 21) return null;
  const next = STAGES[currentN]; // 0-indexed: stage currentN+1
  const blocking: Array<{ part: PartKey; label: string; have: number; need: number }> = [];
  (['head', 'robe', 'train', 'item', 'belt'] as PartKey[]).forEach((k) => {
    if (parts[k] < next[k]) {
      blocking.push({ part: k, label: PART_LABEL[k], have: parts[k], need: next[k] });
    }
  });
  return { stage: next, blocking };
}

export function portraitForStage(n: number, portraitTone: PortraitTone = 'sharp'): PortraitBand {
  const portrait = PORTRAITS.find((p) => n >= p.fromN && n <= p.toN) ?? PORTRAITS[0];
  if (portraitTone === 'sharp') return portrait;
  const prefix = portraitTone === 'pop' ? 'pop-stage-' : 'yuru-stage-';
  return {
    ...portrait,
    src: portrait.src.replace('/portraits/stage-', `/portraits/${prefix}`),
    thumb: portrait.thumb.replace('/portraits/stage-', `/portraits/${prefix}`),
  };
}

// avgPct (0-100) → Lv (1..maxLv) を線形 + 四捨五入で算出。
// pct=0 → Lv1、pct=100 → Lv max。中間はなめらかに昇格。
export function partLevelFromPct(avgPct: number, maxLv: number): number {
  if (avgPct <= 0) return 1;
  const lv = 1 + Math.floor((Math.min(100, avgPct) / 100) * (maxLv - 1) + 0.5);
  return Math.max(1, Math.min(maxLv, lv));
}

// fieldMastery (5章×avgTierPct) を 5 パーツ Lv に変換。
export function partsFromFieldMastery(fm: {
  ch1: { avgTierPct: number };
  ch2: { avgTierPct: number };
  ch3: { avgTierPct: number };
  ch4: { avgTierPct: number };
  ch5: { avgTierPct: number };
}): PartLevels {
  return {
    head:  partLevelFromPct(fm.ch1.avgTierPct, PART_MAX_LV.head),
    robe:  partLevelFromPct(fm.ch2.avgTierPct, PART_MAX_LV.robe),
    train: partLevelFromPct(fm.ch3.avgTierPct, PART_MAX_LV.train),
    item:  partLevelFromPct(fm.ch4.avgTierPct, PART_MAX_LV.item),
    belt:  partLevelFromPct(fm.ch5.avgTierPct, PART_MAX_LV.belt),
  };
}

// Tier に応じた配色トークン (令和テーマ変数にマップ)。
export const TIER_TONE: Record<Tier, { bg: string; fg: string; accent: string }> = {
  地下:   { bg: 'var(--rw-rule)',         fg: 'var(--rw-ink-soft)', accent: 'var(--rw-ink-soft)' },
  殿上人: { bg: 'var(--rw-accent-soft)',  fg: 'var(--rw-accent)',   accent: 'var(--rw-accent)' },
  公卿:   { bg: 'var(--rw-primary-soft)', fg: 'var(--rw-primary)',  accent: 'var(--rw-primary)' },
  極位:   { bg: 'color-mix(in srgb, gold 30%, var(--rw-paper))', fg: '#8a5a00', accent: '#b58800' },
};
