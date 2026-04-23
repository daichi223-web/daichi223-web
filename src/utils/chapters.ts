// いいずな書店「Key & Point 古文単語330」の章構造。
// group番号と章区分のマッピング。

export type Chapter = {
  id: string;
  label: string;
  short: string;
  start: number;
  end: number;
  count: number;
};

export const CHAPTERS: Chapter[] = [
  { id: 'ch1', label: '読解必修語 50', short: '読解必修', start: 1, end: 50, count: 50 },
  { id: 'ch2', label: '入試必修語 100', short: '入試必修', start: 51, end: 150, count: 100 },
  { id: 'ch3', label: '最重要敬語 30', short: '最重要敬語', start: 151, end: 180, count: 30 },
  { id: 'ch4', label: '入試重要語 100', short: '入試重要', start: 181, end: 280, count: 100 },
  { id: 'ch5', label: '入試攻略語 50', short: '入試攻略', start: 281, end: 330, count: 50 },
  { id: 'ext', label: '追加語', short: '追加', start: 331, end: 9999, count: 38 },
];

export function chapterFor(group: number | undefined | null): Chapter | null {
  if (group == null) return null;
  for (const c of CHAPTERS) {
    if (group >= c.start && group <= c.end) return c;
  }
  return null;
}

export function chapterColor(ch: Chapter | null): {
  bg: string;
  text: string;
  border: string;
} {
  if (!ch) return { bg: '#f0f0f5', text: '#666', border: '#ddd' };
  switch (ch.id) {
    case 'ch1':
      return { bg: '#fde8e8', text: '#c0392b', border: '#e74c3c' };
    case 'ch2':
      return { bg: '#ffe9d9', text: '#a0461e', border: '#e67e22' };
    case 'ch3':
      return { bg: '#fdf6e3', text: '#806622', border: '#d4a017' };
    case 'ch4':
      return { bg: '#e0f7e3', text: '#2d7a3f', border: '#3c9f5d' };
    case 'ch5':
      return { bg: '#eef4fb', text: '#2b5a8e', border: '#4a90e2' };
    case 'ext':
      return { bg: '#f3eefb', text: '#5a3780', border: '#8b5cf6' };
    default:
      return { bg: '#f0f0f5', text: '#666', border: '#ddd' };
  }
}
