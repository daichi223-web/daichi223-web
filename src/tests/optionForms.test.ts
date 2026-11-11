import { describe, it, expect } from 'vitest';
import {
  baseForm, conjugate, detectForm, exampleFittedLabels, textAfterBlank, translationBlank,
} from '../lib/quiz/optionForms';
import slimJson from '../data/kobunQ.v2.slim.json';

type W = { qid: string; lemma: string; sense: string; senseNorm?: string; pos?: string; examples?: { jp: string; translation: string }[] };
const slim = slimJson as W[];
const Q = new Map(slim.map((w) => [w.qid, w]));
const labelsFor = (qid: string, ex: number, others: string[]) => {
  const w = Q.get(qid)!;
  return exampleFittedLabels(others.map((q) => Q.get(q)!), w, w.examples![ex].translation);
};

describe('現代語の活用', () => {
  it('形容詞・形容動詞・動詞の主な形', () => {
    expect(conjugate('おもしろい', 'renyo')).toBe('おもしろく');
    expect(conjugate('おもしろい', 'renyoTa')).toBe('おもしろかっ');
    expect(conjugate('気がかりだ', 'rentai')).toBe('気がかりな');
    expect(conjugate('気づく', 'renyoTa')).toBe('気づい');
    expect(conjugate('祈る', 'renyoTa')).toBe('祈っ');
    expect(conjugate('似る', 'renyoTa')).toBe('似');
    expect(conjugate('思われる', 'renyoTa')).toBe('思われ');
    expect(conjugate('大騒ぎする', 'renyoTa')).toBe('大騒ぎし');
    expect(conjugate('いらっしゃる', 'renyo')).toBe('いらっしゃい');
    expect(conjugate('参る', 'renyoTa')).toBe('参っ');
  });

  it('辞書の形は最初の言い方。括弧の中の「・」では区切らず、後ろの注記は外す', () => {
    expect(baseForm('あります（丁寧・本動詞）')).toEqual({ prefix: '', core: 'あります' });
    expect(baseForm('（人から）思われる')).toEqual({ prefix: '（人から）', core: '思われる' });
    expect(baseForm('見たい・聞きたい・知りたい')).toEqual({ prefix: '', core: '見たい' });
  });

  it('訳の穴と直後の文字', () => {
    const t = '（訳）たいそう悲しく〔 思われ 〕た。';
    expect(translationBlank(t)).toBe('思われ');
    expect(textAfterBlank(t)).toBe('た。');
    expect(detectForm('思われる', '思われ', 'た。')).toBe('renyoTa');
    expect(detectForm('気がかりだ', '気がかりな', 'ことだ')).toBe('rentai');
    expect(detectForm('おもしろい', 'おもしろい', '。')).toBe('shushi');
  });
});

describe('例文に合わせた選択肢（2026-11-05 ユーザー指摘の2問）', () => {
  it('をかし 15-2「始め終りこそをかしけれ」: 係り結びではなく訳の形（終止）。おもしろく にしない', () => {
    const L = labelsFor('15-2', 1, ['15-1']);
    expect(L['15-2']).toBe('おもしろい');
    expect(L['15-1']).toBe('趣がある');
  });

  it('おぼつかなし 20-2「いとどおぼつかなし」: 気がかりだ（終止）。誤答も終止', () => {
    const L = labelsFor('20-2', 1, ['20-3', '30-1']);
    expect(L['20-2']).toBe('気がかりだ');
    expect(L['20-3']).toBe('待ち遠しい');
    expect(L['30-1']).toBe('むだだ');
  });

  it('助動詞の訳は足さない（〔思われ〕た → 誤答も「た」を付けない）', () => {
    const L = labelsFor('4-1', 0, ['4-2', '4-3']);
    expect(L['4-1']).toBe('思われ');
    expect(L['4-2']).toBe('似');
    expect(L['4-3']).toBe('思い出され');
    for (const v of Object.values(L)) expect(v.endsWith('た')).toBe(false);
  });

  it('全データ: 正解の文字はその例文の訳の穴の言葉', () => {
    for (const w of slim) {
      for (const e of w.examples ?? []) {
        const blank = translationBlank(e.translation);
        if (!blank) continue;
        expect(exampleFittedLabels([], w, e.translation)[w.qid]).toBe(blank);
      }
    }
  });
});

describe('全件判定で見つかった形（2026-11-05）', () => {
  it('「〜ている」の訳の穴「てい」に合わせる（9-2 例1）', () => {
    expect(labelsFor('9-2', 0, ['9-1'])['9-1']).toBe('座っ');
  });
  it('「退屈で」「役に立たないで」の中止形に合わせる（29-1・30-1）', () => {
    expect(labelsFor('29-1', 1, ['29-2'])['29-2']).toBe('しんみりともの寂しく');
    expect(labelsFor('30-1', 1, ['30-2'])['30-2']).toBe('手持ちぶさたで');
  });
});

describe('連用修飾の形（2026-11-05）', () => {
  it('「平然として」「非常に」に合わせて 形容詞〜く・形容動詞〜に', () => {
    const a = labelsFor('89-1', 1, ['89-2', '89-3']);
    expect(Object.values(a)).toContain('平然として');
    expect(labelsFor('78-4', 1, ['78-1'])['78-1']).toMatch(/[くに]$/);
  });
  it('辞書の形と訳の言葉で品詞が違うときは訳の言葉で（親密だ→「親しい」友人＝連体）', () => {
    expect(labelsFor('79-2', 0, ['79-1'])['79-1']).toBe('端正な');
  });
});

describe('カ変「来る」', () => {
  it('来る → 来（連用）・来れ（仮定）', () => {
    expect(conjugate('来る', 'renyoTa')).toBe('来');
    expect(conjugate('やって来る', 'katei')).toBe('やって来れ');
  });
});

describe('訳の穴が2か所', () => {
  it('同じ言葉なら1つ、違えば「～」でつなぐ', () => {
    expect(translationBlank('〔 順序 〕も〔 順序 〕も')).toBe('順序');
    expect(translationBlank('〔 お 〕話し〔 申し上げる 〕')).toBe('お～申し上げる');
  });
});

describe('命令形・て形・「い」で終わる名詞（2026-11-05）', () => {
  it('命令: 一段〜ろ／〜よ、サ変〜しろ／〜せよ、五段〜え段', () => {
    expect(conjugate('閉める', 'meirei')).toBe('閉めろ');
    expect(conjugate('工夫する', 'meirei')).toBe('工夫しろ');
    expect(conjugate('指図する', 'meireiYo')).toBe('指図せよ');
    expect(conjugate('参る', 'meirei')).toBe('参れ');
    expect(detectForm('準備する', '準備しろ', '。')).toBe('meirei');
  });
  it('て形: 五段の濁る行は〜で', () => {
    expect(conjugate('読む', 'te')).toBe('読んで');
    expect(conjugate('移る', 'te')).toBe('移って');
    expect(conjugate('生まれる', 'te')).toBe('生まれて');
  });
  it('「かねてからの願い」は名詞なので活用させない', () => {
    expect(conjugate('かねてからの願い', 'renyo')).toBeNull();
  });
});

describe('活用形が決まらないときも誤答は最初の言い方だけ', () => {
  it('正解が名詞のとき、誤答に「・」の併記や後ろの注記を残さない', () => {
    const correct = { qid: 'x-1', senseNorm: '手紙' };
    const L = exampleFittedLabels(
      [{ qid: 'x-2', senseNorm: '漢詩・書物' }, { qid: 'x-3', senseNorm: 'あります（丁寧・本動詞）' }],
      correct,
      '（訳）〔 手紙 〕を書く。'
    );
    expect(L['x-2']).toBe('漢詩');
    expect(L['x-3']).toBe('あります');
  });
});

describe('意志の形・「〜」の不一致（2026-11-05 表示の再点検）', () => {
  it('「〔行こ〕う」→ 意志の形', () => {
    expect(detectForm('行く', '行こ', 'う')).toBe('ishi');
    expect(conjugate('いらっしゃる', 'ishi')).toBe('いらっしゃろ');
    expect(conjugate('工夫する', 'ishi')).toBe('工夫しよ');
  });
  it('正解「てい」に誤答「〜てい」を並べない', () => {
    const L = labelsFor('9-1', 0, ['9-2']);
    expect(L['9-2']?.startsWith('〜')).toBe(false);
  });
});

describe('活用の崩れの修正（2026-11-11 05-katsuyo-bug の A〜G。誤答の品詞 pos を使う）', () => {
  it('A 誤答が副詞・活用済みの言い方（pos が活用しない品詞）のときは活用させない', () => {
    // いっそう（副詞）を連用タに合わせて「いっそい」にしない。正解 126-1 は〔自然に〕
    expect(labelsFor('126-1', 0, ['131-1'])['131-1']).toBe('いっそう');
    // はなはだしく（形容詞の連用形の意味）を五段として「はなはだしき」にしない
    expect(labelsFor('67-5', 0, ['77-4'])['77-4']).toBe('はなはだしく');
    // 〜もしるく
    expect(labelsFor('282-2', 0, ['292-2'])['292-2']).toBe('もしるく');
  });
  it('A pos が無いときは従来どおり（後方互換）', () => {
    const L = exampleFittedLabels([{ qid: 'x-2', senseNorm: 'すばらしい' }], { qid: 'x-1', senseNorm: '手紙' }, '（訳）〔 手紙 〕を書く。');
    expect(L['x-2']).toBe('すばらしい');
    const L2 = exampleFittedLabels([{ qid: 'x-2', senseNorm: 'すばらしい' }], { qid: 'x-1', senseNorm: '長年' }, '（訳）〔 長年 〕思って来た。');
    expect(L2['x-2']).toBe('すばらしく'); // pos 不明なら語尾からの推定（従来）
    const L3 = exampleFittedLabels([{ qid: 'x-2', senseNorm: 'すばらしい', pos: '動詞' }], { qid: 'x-1', senseNorm: '長年', pos: '名詞' }, '（訳）〔 長年 〕思って来た。');
    expect(L3['x-2']).toBe('すばらしく'); // 正解が名詞でも直後が述語なら連用修飾にそろえる（誤答の pos は動詞なので活用対象）
    const L4 = exampleFittedLabels([{ qid: 'x-2', senseNorm: 'すばらしい', pos: '名詞' }], { qid: 'x-1', senseNorm: '長年', pos: '名詞' }, '（訳）〔 長年 〕思って来た。');
    expect(L4['x-2']).toBe('すばらしい'); // 誤答が名詞なら活用させない
  });
  it('B 正解が副詞・名詞のときは語尾の文字で動詞・形容詞の形と推定せず、後ろの述語にかかるなら連用修飾（renyo）、そうでなければ決めない', () => {
    // 副詞「とても」＋述語 → 誤答は 〜く・〜に・動詞の連用（形で正解が透けない）
    expect(labelsFor('41-1', 1, ['51-1'])['51-1']).toBe('美しく照り映え');
    expect(labelsFor('78-4', 1, ['78-1'])['78-1']).toMatch(/[くに]$/);
    expect(detectForm('自然に', '自然に', '心が晴れていく。', '副詞')).toBe('renyo');
    // 副詞でも文末・助詞の前は決めない（誤答は辞書の形）
    expect(detectForm('〜できない', 'できない', '。', '副詞')).toBeNull();
    expect(detectForm('おそらく', 'おそらく', 'が', '副詞')).toBeNull();
    // 名詞「長年」（直後が述語）は連用修飾の形にそろえ、直後が「の・が・を・より・から」なら辞書の形
    expect(labelsFor('31-1', 0, ['22-2', '21-1'])).toMatchObject({ '22-2': '立派に', '21-1': 'めったになく' });
    expect(labelsFor('32-1', 0, ['22-2'])['22-2']).toBe('立派だ'); // 〔容貌〕よりは
    expect(labelsFor('34-1', 1, ['30-1'])['30-1']).toBe('むだだ'); // 〔かねてからの願い〕を
    expect(labelsFor('34-1', 0, ['30-1'])['30-1']).toBe('むだだ'); // 〔かねてからの願い〕どおり
    // 体言にかかる形（そのほかの・本格的な）は連体
    expect(detectForm('そのほか', 'そのほかの', '人々は', '副詞')).toBe('rentai');
    // 活用しない語を語尾の文字で動詞・形容詞に取らない: 「たいそう」（う で終わる）を動詞の連体と取らない（14-1 例文2）
    expect(labelsFor('14-1', 1, ['18-2'])['18-2']).toBe('年配に');
    expect(detectForm('とても（程度）', 'たいそう', '自賛しているので', '形容詞')).toBe('renyo');
    // 辞書の形が活用しない語（pos 無し）で訳の穴も辞書の形と一致しない: 終止/連体と推定しない
    expect(detectForm('とても', 'たいそう', '自賛している')).toBe('renyo');
    expect(detectForm('とても', 'たいそう', '。')).toBeNull();
    expect(detectForm('いとしい', 'いとしい', '人。')).toBe('rentai'); // 活用する語は従来どおり
  });
  it('C 副詞「とても」（直後が「うれしい」）を意志形に誤判定しない', () => {
    const L = labelsFor('14-1', 0, ['6-2', '11-1', '14-3', '12-1']);
    expect(L['6-2']).toBe('ぼんやり見');
    expect(L['11-1']).toBe('満足し');
    expect(L['14-3']).toBe('ひどく');
    expect(L['12-1']).toBe('かわいらしく');
    expect(detectForm('行く', '行こ', 'う。')).toBe('ishi');
    expect(detectForm('行く', '行こ', 'うれしい')).not.toBe('ishi');
  });
  it('D 「〜よ」は直後が「う」でなければ命令。「〜ませ＋ん」は命令にしない', () => {
    const L = labelsFor('67-4', 0, ['64-1', '57-1']); // 〔食べよ〕。
    expect(L['64-1']).toBe('行け');
    expect(L['57-1']).toBe('大切に養育せよ');
    expect(detectForm('食べる', '食べよ', '。')).toBe('meireiYo');
    expect(detectForm('食べる', '食べよ', 'う。')).toBe('ishi');
    // 〔出かけませ〕ん → 活用形は決めず、誤答は辞書の形
    expect(detectForm('出かけます（謙譲・丁寧）', '出かけませ', 'ん。')).toBeNull();
    expect(labelsFor('172-3', 0, ['163-2'])['163-2']).toBe('お聞きする');
    // 本当の命令は従来どおり
    expect(detectForm('準備する', '準備しろ', '。')).toBe('meirei');
  });
  it('E 訳の穴が形容詞の連用形（〜らしく）のとき動詞の連体と取らず連用にそろえる', () => {
    expect(detectForm('大人びている', '大人らしく', 'なられたか。', '形容詞')).toBe('renyo');
    const L = labelsFor('18-1', 0, ['18-2', '15-2']);
    expect(L['18-2']).toBe('年配に');
    expect(L['15-2']).toBe('おもしろく');
    expect(detectForm('見たい・聞きたい・知りたい', '聞きたく', '思う。', '形容詞')).toBe('renyo');
  });
  it('F 断定の「だ」（〜ほどだ・〜ようだ・〜ことだ・〜べきだ）は形容動詞として活用させない', () => {
    expect(conjugate('驚きあきれるほどだ', 'rentai')).toBeNull();
    expect(conjugate('当然〜すべきだ', 'renyo')).toBeNull();
    expect(conjugate('立派だ', 'rentai')).toBe('立派な'); // 本物の形容動詞は従来どおり
    expect(labelsFor('77-1', 0, ['87-1'])['87-1']).toBe('驚きあきれるほどだ'); // 〔不吉な〕身
  });
  it('G 感動詞・連語の「、」で切らない（「しっ、静かに」を「しっ」にしない）', () => {
    expect(baseForm('しっ、静かに', '連体詞・連語')).toEqual({ prefix: '', core: 'しっ、静かに' });
    expect(baseForm('しっ、静かに', '感動詞')).toEqual({ prefix: '', core: 'しっ、静かに' });
    expect(baseForm('しっ、静かに')).toEqual({ prefix: '', core: 'しっ' }); // pos 不明は従来どおり
    expect(labelsFor('268-1', 0, ['278-1'])['278-1']).toBe('しっ、静かに');
  });
});
