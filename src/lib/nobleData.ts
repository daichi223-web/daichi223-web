// 貴族版「装束×位階」データモデル。handoff/kizoku/data.js を TS 化。
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

// 21 階位ごとの各部位の正式名称 (表の通り)。Lv 番号は段位進行の math 用、display は表示用。
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
    display: { head: '折烏帽子',          robe: '浅縹',           train: 'なし',       item: '紙',                belt: 'なし' } },
  { n: 3,  rank: '七位',   post: '大允',                head: 2, robe: 3, train: 1, item: 2, belt: 1, era: '地下',
    display: { head: '折烏帽子',          robe: '深縹',           train: 'なし',       item: '木笏',              belt: 'なし' } },
  { n: 4,  rank: '従六下', post: '下国守',              head: 3, robe: 4, train: 2, item: 2, belt: 2, era: '地下',
    display: { head: '立烏帽子',          robe: '浅緑',           train: '短',         item: '木笏',              belt: '平緒' } },
  { n: 5,  rank: '従六上', post: '上国介',              head: 3, robe: 5, train: 2, item: 2, belt: 2, era: '地下',
    display: { head: '立烏帽子',          robe: '深緑',           train: '短',         item: '木笏',              belt: '平緒' } },
  { n: 6,  rank: '正六下', post: '中国守',              head: 3, robe: 5, train: 2, item: 3, belt: 2, era: '地下',
    display: { head: '立烏帽子',          robe: '深緑(綾)',       train: '短',         item: '木笏+紙扇',         belt: '平緒' } },
  { n: 7,  rank: '正六上', post: '大国介・大丞',        head: 4, robe: 5, train: 2, item: 3, belt: 2, era: '地下',
    display: { head: '立烏帽子(紋付)',    robe: '深緑(地紋)',     train: '短',         item: '木笏+紙扇',         belt: '平緒' } },
  { n: 8,  rank: '従五下', post: '上国守・少納言',      head: 5, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人', milestone: '殿上人',
    display: { head: '冠(纓短)',          robe: '浅緋',           train: '中',         item: '象牙笏+檜扇',       belt: '細太刀(黒漆)' } },
  { n: 9,  rank: '従五上', post: '大国守・侍従',        head: 5, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人',
    display: { head: '冠(纓中)',          robe: '浅緋',           train: '中',         item: '象牙笏+檜扇',       belt: '細太刀' } },
  { n: 10, rank: '正五下', post: '少弁・近衛少将',      head: 6, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '浅緋(綾)',       train: '中',         item: '象牙笏+檜扇',       belt: '細太刀' } },
  { n: 11, rank: '正五上', post: '中弁・大判事',        head: 6, robe: 6, train: 3, item: 4, belt: 3, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '浅緋(地紋)',     train: '中',         item: '象牙笏+檜扇',       belt: '細太刀' } },
  { n: 12, rank: '従四下', post: '八省輔・近衛中将',    head: 6, robe: 7, train: 4, item: 4, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '深緋',           train: '長',         item: '象牙笏+檜扇',       belt: '飾太刀(銀)' } },
  { n: 13, rank: '従四上', post: '京大夫・大宰大弐',    head: 6, robe: 7, train: 4, item: 4, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓)',          robe: '深緋(綾)',       train: '長',         item: '象牙笏+檜扇',       belt: '飾太刀(銀)' } },
  { n: 14, rank: '正四下', post: '七省卿・参議',        head: 6, robe: 7, train: 4, item: 5, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓・格上)',    robe: '深緋(地紋)',     train: '長',         item: '象牙笏+蒔絵檜扇',   belt: '飾太刀(銀)' } },
  { n: 15, rank: '正四上', post: '中務卿・左右大弁',    head: 6, robe: 7, train: 4, item: 5, belt: 4, era: '殿上人',
    display: { head: '冠(垂纓・格上)',    robe: '深緋(地紋)',     train: '長',         item: '象牙笏+蒔絵檜扇',   belt: '飾太刀(銀)' } },
  { n: 16, rank: '従三',   post: '中納言・大宰帥',      head: 7, robe: 8, train: 4, item: 5, belt: 4, era: '公卿', milestone: '公卿',
    display: { head: '冠(高位垂纓)',      robe: '浅紫',           train: '長',         item: '象牙笏+蒔絵檜扇',   belt: '飾太刀(銀金)' } },
  { n: 17, rank: '正三',   post: '大納言',              head: 7, robe: 8, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(高位垂纓)',      robe: '浅紫(綾)',       train: '最長',       item: '象牙笏+極上檜扇',   belt: '飾太刀(金)' } },
  { n: 18, rank: '従二',   post: '内大臣',              head: 7, robe: 8, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(極位垂纓)',      robe: '浅紫(地紋)',     train: '最長',       item: '象牙笏+極上檜扇',   belt: '飾太刀(金)' } },
  { n: 19, rank: '正二',   post: '左大臣・右大臣',      head: 7, robe: 8, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(極位垂纓)',      robe: '浅紫(雲鶴)',     train: '最長',       item: '象牙笏+極上檜扇',   belt: '飾太刀(金)' } },
  { n: 20, rank: '従一',   post: '摂政・関白',          head: 7, robe: 9, train: 5, item: 5, belt: 5, era: '公卿',
    display: { head: '冠(極位)',          robe: '深紫',           train: '最長',       item: '象牙笏+至高檜扇',   belt: '儀仗太刀(金)' } },
  { n: 21, rank: '正一',   post: '太政大臣',            head: 7, robe: 9, train: 5, item: 5, belt: 5, era: '極位', milestone: '極位', apex: true,
    display: { head: '冠(極位・銀飾)',    robe: '深紫(雲鶴鳳凰)', train: '最長(8尺)',  item: '象牙笏+至高檜扇',   belt: '儀仗太刀(金銀)' } },
];

// 袍 (robe) の色名先頭一致で代表色を返す。stage.display.robe を渡す。
// 全 19 種類の robe 名 (浅縹/深縹/浅緑/深緑/深緑(綾)/深緋/深緋(地紋)/浅紫(雲鶴) 等) の
// 基調色を 9 つに丸めて表示用に使う。
export function robeColorOf(robeName: string): string {
  if (robeName.startsWith('白'))    return '#f3ecdc';
  if (robeName.startsWith('浅縹'))  return '#a7c4d8';
  if (robeName.startsWith('深縹'))  return '#3d5c80';
  if (robeName.startsWith('浅緑'))  return '#a4b97a';
  if (robeName.startsWith('深緑'))  return '#4b6b3a';
  if (robeName.startsWith('浅緋'))  return '#cf6a4e';
  if (robeName.startsWith('深緋'))  return '#9c2e2a';
  if (robeName.startsWith('浅紫'))  return '#8a6aa6';
  if (robeName.startsWith('深紫'))  return '#4a2a5c';
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

// 8 枚の水彩ポートレート。fromN..toN のステージ範囲を 1 枚で代表させる。
// focusX/focusY は object-position (%) — 人物が中心になるトリミング基準。
export type PortraitBand = {
  src: string;
  fromN: number;
  toN: number;
  label: string;
  note: string;
  focusX: number;
  focusY: number;
  palette: [string, string, string];
};

export const PORTRAITS: PortraitBand[] = [
  { src: '/portraits/01-mui-bench.png',    fromN: 1,  toN: 1,
    label: '童 ・ 入門',
    note: '無位の若者 ・ 書を抱きて 御所の縁に座す',
    focusX: 52, focusY: 50,
    palette: ['#e9e0cc', '#a89677', '#6b5a3e'] },
  { src: '/portraits/02-mui-study.png',    fromN: 2,  toN: 2,
    label: '八 位 ・ 少 録',
    note: '燈下に巻物を解く ・ 八位の見習い ・ 浅縹の袍',
    focusX: 48, focusY: 50,
    palette: ['#e6dbc2', '#7e6a4d', '#3c2f1e'] },
  { src: '/portraits/02-mui-study.png',    fromN: 3,  toN: 3,
    label: '七 位 ・ 大 允',
    note: '深縹に進み木笏を執る ・ 七位の官人',
    focusX: 48, focusY: 50,
    palette: ['#e6dbc2', '#7e6a4d', '#3c2f1e'] },
  { src: '/portraits/04-jige-coral.png',   fromN: 4,  toN: 7,
    label: '地 下 官 人',
    note: '紅梅の袍を賜り、笏を取る ・ 六位の地下',
    focusX: 52, focusY: 55,
    palette: ['#e98c78', '#c45441', '#7b2e22'] },
  { src: '/portraits/08-tenjo-red.png',    fromN: 8,  toN: 11,
    label: '殿 上 人 入',
    note: '初めて殿上を許される ・ 五位 ・ 細太刀を佩く',
    focusX: 50, focusY: 55,
    palette: ['#e87060', '#b8423a', '#5e1c19'] },
  { src: '/portraits/12-tenjo-purple.png', fromN: 12, toN: 15,
    label: '近 衛 中 将',
    note: '浅紫の袍 ・ 四位 ・ 飾太刀を許される',
    focusX: 50, focusY: 55,
    palette: ['#b89bc4', '#8a6aa6', '#4a2a5c'] },
  { src: '/portraits/16-kugyo-fan.png',    fromN: 16, toN: 17,
    label: '公 卿 ・ 参 議',
    note: '雲鶴の地紋 ・ 牛車を許される ・ 三位',
    focusX: 48, focusY: 55,
    palette: ['#c9b0d4', '#8a6aa6', '#3d2050'] },
  { src: '/portraits/18-kugyo-scroll.png', fromN: 18, toN: 19,
    label: '大 納 言',
    note: '雲鶴鳳凰の最高級地紋 ・ 二位 ・ 蒔絵牛車',
    focusX: 65, focusY: 55,
    palette: ['#d0b8d8', '#8c6cb0', '#3a1a4a'] },
  { src: '/portraits/20-kyokui-seal.png',  fromN: 20, toN: 20,
    label: '従 一 位 ・ 摂 関',
    note: '深紫の袍 ・ 摂政関白 ・ 一の人',
    focusX: 60, focusY: 55,
    palette: ['#a78bbf', '#6a4889', '#2c1640'] },
  { src: '/portraits/20-kyokui-seal.png',  fromN: 21, toN: 21,
    label: '正 一 位 ・ 太 政 大 臣',
    note: '深紫鳳凰の極位 ・ 七尺の長き裾 ・ 太政大臣の威容',
    focusX: 60, focusY: 55,
    palette: ['#a78bbf', '#6a4889', '#2c1640'] },
];

// 部位ごとの解説図 (StatsPage の図解で使う)
export const PART_CHARTS: Array<{ key: PartKey; label: string; src: string; cap: number }> = [
  { key: 'head',  label: '頭 ・ 烏帽子の七段',   src: '/portraits/chart-head.png',  cap: 7 },
  { key: 'robe',  label: '袍 ・ 色目の九段',     src: '/portraits/chart-robe.png',  cap: 9 },
  { key: 'train', label: '裾 ・ 下襲の五段',     src: '/portraits/chart-train.png', cap: 5 },
  { key: 'item',  label: '持物 ・ 笏と扇の五段', src: '/portraits/chart-item.png',  cap: 5 },
  { key: 'belt',  label: '帯 ・ 太刀の五段',     src: '/portraits/chart-belt.png',  cap: 5 },
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

export function portraitForStage(n: number): PortraitBand {
  return PORTRAITS.find((p) => n >= p.fromN && n <= p.toN) ?? PORTRAITS[0];
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
