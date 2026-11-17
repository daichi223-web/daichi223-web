import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVINCES, SHINNO_NINKOKU, defaultPost, displayPost, postNames, postOptions, readChosenPost, writeChosenPost } from '../lib/kanshoku';
import { STAGES } from '../lib/nobleData';

describe('延喜式の国の等級', () => {
  it('大国13・上国35・中国11・下国9＝68か国、重複なし', () => {
    expect(PROVINCES.大国.length).toBe(13);
    expect(PROVINCES.上国.length).toBe(35);
    expect(PROVINCES.中国.length).toBe(11);
    expect(PROVINCES.下国.length).toBe(9);
    const all = Object.values(PROVINCES).flat();
    expect(new Set(all).size).toBe(68);
    for (const p of SHINNO_NINKOKU) expect(PROVINCES.大国).toContain(p);
  });
});

describe('postOptions（段ごとの官職）', () => {
  it('21段すべてに候補がある', () => {
    for (const s of STAGES) expect(postNames(s.n).length, `${s.n}`).toBeGreaterThan(0);
  });

  it('受領：大国守は従五位上（第9階）、中国守と大国介は正六位下（第6階）、中国・下国に介は無い', () => {
    expect(postNames(9)).toContain('播磨守');
    expect(postNames(6)).toContain('土佐守');
    expect(postNames(6)).toContain('播磨介');
    expect(postNames(4)).toContain('和泉守');
    expect(postNames(5)).toContain('讃岐介');
    expect(Object.values(Object.fromEntries(STAGES.map((s) => [s.n, postNames(s.n)]))).flat()).not.toContain('土佐介');
  });

  it('親王任国の守は名乗れず、介は名乗れる', () => {
    expect(postNames(9)).not.toContain('上総守');
    expect(postNames(9)).not.toContain('常陸守');
    expect(postNames(6)).toContain('上総介');
    expect(postNames(6)).toContain('常陸介');
  });

  it('有名どころ：六位蔵人・五位蔵人・蔵人頭・少納言・近衛中将・中納言', () => {
    expect(postNames(7)).toContain('六位蔵人');
    expect(postNames(8)).toContain('少納言');
    expect(postNames(8)).toContain('侍従');
    expect(postNames(10)).toContain('五位蔵人');
    expect(postNames(12)).toContain('近衛中将');
    expect(postNames(13)).toContain('蔵人頭');
    expect(postNames(16)).toContain('中納言');
    expect(postOptions(9).some((o) => o.kind === 'zuryo')).toBe(true);
  });

  it('既定の表示（STAGES の post の先頭）はその段の候補に入っている', () => {
    for (const s of STAGES) {
      const d = defaultPost(s);
      const names = postNames(s.n);
      const ok = names.includes(d) || /^(大国|上国|中国|下国)(守|介)$/.test(d) || d === '大弁';
      expect(ok, `${s.n} ${d}`).toBe(true);
    }
  });
});

describe('選んだ官職（端末ごと）', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal('window', { dispatchEvent: () => true });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('選ぶと表示が変わり、null で既定に戻る', () => {
    const s = STAGES[8]; // 第9階 従五上
    expect(displayPost(s)).toBe('大国守');
    writeChosenPost(9, '播磨守');
    expect(readChosenPost(9)).toBe('播磨守');
    expect(displayPost(s)).toBe('播磨守');
    writeChosenPost(9, null);
    expect(displayPost(s)).toBe('大国守');
  });

  it('その段の候補に無い名前は捨てる（別の段の官職・表を直したあとの古い値）', () => {
    writeChosenPost(9, '大納言');
    expect(readChosenPost(9)).toBeNull();
  });
});
