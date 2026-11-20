import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import textsIndex from '../data/textsIndex.json';
import {
  BY_TEXT, BY_WORK, isReadingTestCleared, isTeacherUnlocked, readUnlockedTeachers, unlockOnTextClear, unlockTeacher, workTeacherOf,
} from '../lib/workTeachers';
import { unlockTextOf } from '../lib/teacherTexts';
import { ALL_TEACHER_IDS, TEACHER_IDS } from '../lib/teachers';
import { readChatTeacher, CHAT_TEACHER_KEY } from '../lib/chatTeacher';
import { COLLAPSED_COUNT, collapsedTeachers } from '../components/quiz/QuizLookSettings';

type IndexRow = { id: string; source_work?: string | null };
const rows: IndexRow[] = (Array.isArray(textsIndex) ? textsIndex : Object.values(textsIndex)) as IndexRow[];

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('window', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
  return store;
}

describe('workTeacherOf（教材の先生）', () => {
  it('竹取物語はかぐや姫、伊勢は業平、土佐は貫之、菅公配流は道真', () => {
    expect(workTeacherOf('x', '竹取物語')).toBe('kaguya');
    expect(workTeacherOf('x', '伊勢物語')).toBe('narihira');
    expect(workTeacherOf('x', '土佐日記')).toBe('tsurayuki');
    expect(workTeacherOf('b34f00e739', '大鏡（二）')).toBe('michizane');
  });

  it('決まっていない教材は null（選んでいる先生のまま）', () => {
    expect(workTeacherOf('x', '大鏡（二）')).toBeNull();
    expect(workTeacherOf('x', '無名草子')).toBeNull();
    expect(workTeacherOf('x', null)).toBeNull();
  });

  it('表の作品名・教材ID は索引に実在し、先生は台詞のある先生だけ', () => {
    const works = new Set(rows.map((r) => r.source_work));
    const ids = new Set(rows.map((r) => r.id));
    for (const w of Object.keys(BY_WORK)) expect(works.has(w), w).toBe(true);
    for (const id of Object.keys(BY_TEXT)) expect(ids.has(id), id).toBe(true);
    for (const t of [...Object.values(BY_WORK), ...Object.values(BY_TEXT)]) expect(ALL_TEACHER_IDS).toContain(t);
  });

  it('竹取物語の10本は章段ごとの中心の人物（2026-11-18 ユーザー決定）', () => {
    const taketori = rows.filter((r) => r.source_work === '竹取物語');
    expect(taketori.length).toBe(10);
    const expected: Record<string, string> = {
      ec2159c6e8: 'taketorinookina', // かぐや姫の生い立ち
      '86b5308b5a': 'kaguya', // 貴公子たちの妻問い
      e9846f4330: 'ishitsukuri', // 仏の御石の鉢
      '97a9d9174a': 'kuramochi', // 蓬萊の玉の枝
      '5954a8d9eb': 'abenomiushi', // 火鼠の皮衣
      cd8147e868: 'otomonomiyuki', // 龍の首の玉
      '949859d6f5': 'isonokami', // 燕の子安貝
      '7eb37dba92': 'mikado', // 御狩のみゆき
      d50584362e: 'kaguya', // 天の羽衣
      '067781f251': 'mikado', // ふじの煙
    };
    for (const r of taketori) expect(workTeacherOf(r.id, r.source_work)).toBe(expected[r.id]);
  });

  it('源氏物語は1本ごとの中心の人物。亡くなる場面と廃院の怪は紫式部（2026-11-18 ユーザー決定）', () => {
    const genji = rows.filter((r) => (r.source_work ?? '').startsWith('源氏物語（'));
    expect(genji.length).toBe(11);
    const expected: Record<string, string> = {
      cec7f3b46f: 'kiritsubo', // 光源氏の誕生
      '83e7b6a341': 'murasaki', // 飽かぬ別れ（桐壺更衣が亡くなる）
      '249a2e97df': 'murasaki', // 廃院の怪
      fd3012c216: 'wakamurasaki', // 若紫の君（2026-11-19 紫の上から若紫へ）
      f78ab86be9: 'hikaru', // 心づくしの秋
      da30d34a6c: 'onnasannomiya', // 暁の雪
      '0a93657296': 'akashi', // 母子の別離
      '467249bc39': 'murasaki', // 萩のうは露（紫の上が亡くなる）
      '364673ceb1': 'aoi', // 車争ひ
      fe466e5a11: 'kaoru', // 霧の中のかいま見
      '4c5d7950dd': 'oigimi', // 髪の香
    };
    for (const r of genji) expect(workTeacherOf(r.id, r.source_work)).toBe(expected[r.id]);
  });
});

describe('クリアで先生が手に入る', () => {
  beforeEach(() => { stubStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('クリア＝3問以上で8割以上', () => {
    expect(isReadingTestCleared(4, 5)).toBe(true);
    expect(isReadingTestCleared(3, 5)).toBe(false);
    expect(isReadingTestCleared(8, 10)).toBe(true);
    expect(isReadingTestCleared(7, 10)).toBe(false);
    expect(isReadingTestCleared(2, 2)).toBe(false);
  });

  it('はじめの10人は最初から手に入っている。かぐや姫はクリアで手に入り、2回目は新しくない', () => {
    for (const id of TEACHER_IDS) expect(isTeacherUnlocked(id)).toBe(true);
    expect(isTeacherUnlocked('kaguya')).toBe(false);
    expect(unlockTeacher('sei')).toBe(false);
    expect(unlockTeacher('kaguya')).toBe(true);
    expect(isTeacherUnlocked('kaguya')).toBe(true);
    expect(unlockTeacher('kaguya')).toBe(false);
    expect(readUnlockedTeachers()).toEqual(['kaguya']);
  });

  it('手に入れていない先生が選択に残っていても、既定の先生に戻す', () => {
    const store = stubStorage();
    store.set(CHAT_TEACHER_KEY, 'kaguya');
    expect(readChatTeacher()).toBe('sei');
    unlockTeacher('kaguya');
    expect(readChatTeacher()).toBe('kaguya');
  });

  it('公任・行成・宣長は教材ごと（行成は清少納言から振り替え。2026-11-19）', () => {
    expect(workTeacherOf('f1c4b82dd3', '大鏡（一）')).toBe('kinto');
    expect(workTeacherOf('ff9c2346eb', '枕草子（二）')).toBe('yukinari');
    expect(workTeacherOf('8bb763a731', '源氏物語玉の小櫛')).toBe('norinaga');
  });

  it('大君を手に入れると、中の君も一緒に加わる', () => {
    expect(unlockOnTextClear('4c5d7950dd', '源氏物語（二）')).toEqual(['oigimi', 'nakanokimi']);
    expect(unlockOnTextClear('4c5d7950dd', '源氏物語（二）')).toEqual([]);
  });

  it('若紫を手に入れたあと、源氏物語のほかの教材をクリアすると紫の上も加わる', () => {
    // 若紫より前に源氏のほかの教材を解いても、紫の上は来ない
    expect(unlockOnTextClear('f78ab86be9', '源氏物語（二）')).toEqual(['hikaru']);
    expect(unlockOnTextClear('fd3012c216', '源氏物語（一）')).toEqual(['wakamurasaki']);
    // 若紫の教材をもう一度解いても「ほかの教材」に数えない
    expect(unlockOnTextClear('fd3012c216', '源氏物語（一）')).toEqual([]);
    // 玉の小櫛は源氏物語の教材ではない
    expect(unlockOnTextClear('8bb763a731', '源氏物語玉の小櫛')).toEqual(['norinaga']);
    // 先生が紫式部の教材（廃院の怪）でもよい
    expect(unlockOnTextClear('249a2e97df', '源氏物語（一）')).toEqual(['murasakinoue']);
    expect(isTeacherUnlocked('murasakinoue')).toBe(true);
  });

  it('🔒の飛び先：中の君は姉の教材、紫の上は若紫がまだなら若紫の教材・手に入れたら源氏のほかの教材', () => {
    const r = [
      { id: '249a2e97df', source: '源氏物語（一）' },
      { id: 'fd3012c216', source: '源氏物語（一）' },
      { id: '4c5d7950dd', source: '源氏物語（二）' },
    ];
    expect(unlockTextOf('nakanokimi', r, null)).toBe('4c5d7950dd');
    expect(unlockTextOf('murasakinoue', r, null)).toBe('fd3012c216');
    expect(unlockTextOf('murasakinoue', r, null, ['wakamurasaki'])).toBe('249a2e97df');
    expect(unlockTextOf('murasakinoue', r, new Set(['4c5d7950dd']), ['wakamurasaki'])).toBe('4c5d7950dd');
  });

  it('壊れた値は空として読む', () => {
    const store = stubStorage();
    store.set('kobun.chat.unlockedTeachers', '{oops');
    expect(readUnlockedTeachers()).toEqual([]);
    store.set('kobun.chat.unlockedTeachers', JSON.stringify(['kaguya', 'hakase']));
    expect(readUnlockedTeachers()).toEqual(['kaguya']);
  });
});

describe('collapsedTeachers（先生の選択をたたんだとき）', () => {
  it(`たたむと${COLLAPSED_COUNT}人。選んでいる先生は必ず入る`, () => {
    expect(collapsedTeachers(TEACHER_IDS, 'sei')).toEqual(TEACHER_IDS.slice(0, COLLAPSED_COUNT));
    const c = collapsedTeachers([...TEACHER_IDS, 'kaguya'], 'kaguya');
    expect(c.length).toBe(COLLAPSED_COUNT);
    expect(c[0]).toBe('kaguya');
  });
});
