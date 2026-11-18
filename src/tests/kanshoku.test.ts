import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVINCES, SHINNO_NINKOKU, defaultPost, displayPost, kaisetsuFor, postNames, postOptions, readChosenPost, writeChosenPost } from '../lib/kanshoku';
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

describe('kaisetsuFor（選ぶときの解説）', () => {
  it('すべての段の、名乗れる名前すべてに解説がある', () => {
    for (const s of STAGES) for (const name of postNames(s.n)) expect(kaisetsuFor(name), `${s.n} ${name}`).not.toBeNull();
  });

  it('等級の見出し（大国守など）にも解説がある', () => {
    for (const s of STAGES) for (const o of postOptions(s.n)) if (o.kind === 'zuryo') expect(kaisetsuFor(`${o.grade}${o.post}`)).not.toBeNull();
  });

  it('受領は国の読み＋の＋かみ／すけ、国と守介の2文', () => {
    const v = kaisetsuFor('播磨守')!;
    expect(v.kana).toBe('はりまのかみ');
    expect(v.lines.length).toBe(2);
    expect(kaisetsuFor('上総介')!.kana).toBe('かずさのすけ');
    expect(kaisetsuFor('蔵人頭')!.kana).toBe('くろうどのとう');
  });

  it('知らない名前は null（推測で作らない）', () => {
    expect(kaisetsuFor('宇宙守')).toBeNull();
    expect(kaisetsuFor('なにか')).toBeNull();
  });
});

describe('出世ルート・次に進む先・用語', () => {
  it('ルートの段と官職名は、その段の候補か受領の等級に合う（位の外の身分は n=null）', async () => {
    const { CAREER_ROUTES } = await import('../lib/kanshokuData');
    for (const r of CAREER_ROUTES) {
      expect(r.steps.length, r.id).toBeGreaterThan(2);
      for (const s of r.steps) {
        if (s.n === null) continue;
        const ok = postNames(s.n).includes(s.post) || /^(大国|上国|中国|下国)(守|介)$/.test(s.post);
        expect(ok, `${r.id}: ${s.n} ${s.post}`).toBe(true);
      }
    }
  });

  it('六位蔵人のあとは五位蔵人（公卿への道）など。受領は国名でも等級で引く', async () => {
    const { nextPostsOf } = await import('../lib/kanshoku');
    expect(nextPostsOf('六位蔵人').map((x) => x.post)).toContain('五位蔵人');
    const harima = nextPostsOf('播磨守');
    expect(harima).toEqual(nextPostsOf('大国守'));
  });

  it('用語・女房の官も解説に出る', () => {
    expect(kaisetsuFor('叙爵')?.kana).toBe('じょしゃく');
    expect(kaisetsuFor('尚侍')?.kana).toBe('ないしのかみ');
  });
});
