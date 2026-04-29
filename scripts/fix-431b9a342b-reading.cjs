#!/usr/bin/env node
/**
 * 落窪の君 (431b9a342b) の読解ガイド annotation を新 sentence ID にリマップ。
 *
 * 旧 reading file は 31 annotation で 細粒度な sentence partition を想定していた。
 * 新 texts-v3 では 29 sentences の比較的大粒度な partition となる。
 * 旧 annotation の guide / hints を新 sentence ID に対応付けて merge する。
 *
 * マッピング:
 *  旧 s1〜s8 (冒頭の継子いじめ導入 8 場面) → 新 s1 (大段落) にすべて merge
 *  旧 s9 (waka 日にそへて) → 新 s2
 *  旧 s10 (誰かは教へむ) → 新 s3
 *  旧 s11+s12 前半 (箏の琴) → 新 s4
 *  旧 s12 後半 (北の方のたまへば) → 新 s5
 *  旧 s13+s14 前半 (縫物 + 北の方セリフ) → 新 s6
 *  旧 s14 後半 (まめやかに習ひたるぞよき) → 新 s7
 *  旧 s15 (「とて」二人の婿の装束) + s16 前半 → 新 s8
 *  旧 s16 後半 + s17 前半 (もの憂げ・役にせむ) → 新 s9
 *  旧 s17 後半 (消え失せぬるわざもがな) → 新 s10
 *  (新 s11 「と嘆く。」 短文 → s10 と統合)
 *  旧 s18 (三の君 裳着・蔵人の少将) → 新 s12
 *  (新 s13 「落窪の君、まして暇なく〜苦しきことまさる。」 → 新 annotation 追加)
 *  旧 s19+s20+s21 (若くめでたき人〜縫ふままに) → 新 s14
 *  旧 s22 (waka 世の中にいかであらじ) → 新 s15
 *  旧 s23 (召しに召し出づ) → 新 s16
 *  旧 s24 前半 (本意なくかなし「わが君に」) → 新 s17
 *  旧 s24 後半 (こと君どり) → 新 s18
 *  旧 s25 前半 (「何か」) → 新 s19
 *  旧 s25 中盤 (同じことと見てむ) → 新 s20
 *  旧 s25 後半 (なかなかうれし) → 新 s21
 *  (新 s22 「とのたまふ。」 → s21 と統合)
 *  旧 s26+s27 (心細げ・あこき改名) → 新 s23
 *  (新 s24 「後見といふ名いと便なし〜あこきとつけたまふ。」 → 新 annotation)
 *  旧 s28 (かかるほどに 小帯刀) → 新 s25
 *  旧 s29 (あこきの語り) → 新 s26
 *  旧 s30 (盗ませたてまつらむ) → 新 s27
 *  旧 s31 (巻末) → 新 s28
 *  (新 s29 「（巻の一）」 → 新 annotation)
 */
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'public', 'reading', '431b9a342b.json');
const distFp = path.join(__dirname, '..', 'dist', 'reading', '431b9a342b.json');
const r = JSON.parse(fs.readFileSync(fp, 'utf8'));

const oldAnns = {};
for (const a of r.annotations) oldAnns[a.sentenceId] = a;

// 新 annotations を構築
const newAnnotations = [];

// ── 新 s1: 旧 s1〜s8 統合 (冒頭の継子いじめ導入大段落) ──
{
  const s1 = oldAnns.s1;
  const merged = {
    sentenceId: 's1',
    guide: '落窪物語 巻一冒頭。中納言家の家族構成と、わかうどほり腹の君（落窪の君）が継母（北の方）に冷遇される導入。「今は昔」「おはしき」「けり」「だに」「ぞ〜連体形」「まじ」など多様な語法が登場。継子いじめの第一段階（呼称・部屋・存在の隠蔽）を一段で描く。',
    hints: [],
  };
  for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
    const a = oldAnns[id];
    if (!a) continue;
    for (const h of a.hints) merged.hints.push(h);
  }
  newAnnotations.push(merged);
}

// ── 新 s2: 旧 s9 (waka 日にそへて) ──
newAnnotations.push({ ...oldAnns.s9, sentenceId: 's2' });

// ── 新 s3: 旧 s10 (誰かは教へむ) ──
newAnnotations.push({ ...oldAnns.s10, sentenceId: 's3' });

// ── 新 s4: 旧 s11 + s12 前半 (箏の琴・三郎君に習はせ) ──
{
  const s11 = oldAnns.s11;
  const s12 = oldAnns.s12;
  const merged = {
    sentenceId: 's4',
    guide: '亡き母君が幼い落窪の君に習わせておいた箏の琴の腕前を北の方が利用し、実子（当腹の三郎君）に教えるよう命じる。「弾きたまひければ」「のたまへば」と「ば」が連鎖する流れ。',
    hints: [...(s11?.hints || []), ...(s12?.hints || [])],
  };
  newAnnotations.push(merged);
}

// ── 新 s5: 旧 s12 末尾 (時々教ふ) ──
newAnnotations.push({
  sentenceId: 's5',
  guide: '北の方の発話を引用助詞「と」で締め、「時々教ふ」で落窪の君の応答動作を示す。「のたまへば」の「ば」は已然形＋ば（順接確定）。',
  hints: [
    {
      type: 'grammar',
      label: '会話文の締め方',
      points: [
        '「『これに習はせ。』と、北の方のたまへば」の構造',
        '「と」＝引用助詞、「のたまへば」＝言ふの尊敬「のたまふ」已然＋ば',
        '主語＝北の方（命令）、応答動作主＝落窪の君（教ふ）',
      ],
    },
  ],
});

// ── 新 s6: 旧 s13 + s14 前半 (つくづく〜「いとよかめり。) ──
{
  const s13 = oldAnns.s13;
  const s14 = oldAnns.s14;
  const merged = {
    sentenceId: 's6',
    guide: '落窪の君が縫物を習得して上手に縫う様を見て、北の方が「いとよかめり」と評価する場面の導入。「習ひければ」「縫ひたまひければ」と「ば」連鎖で原因・結果が累積し北の方の発話を導く。',
    hints: [...(s13?.hints || []), ...(s14?.hints?.slice(0, 2) || [])],
  };
  newAnnotations.push(merged);
}

// ── 新 s7: 旧 s14 後半 (ものまめやかに習ひたるぞよき) ──
{
  const s14 = oldAnns.s14;
  newAnnotations.push({
    sentenceId: 's7',
    guide: '北の方の本音「ことなる顔かたちなき人は、ものまめやかに習ひたるぞよき」。落窪の君を直接名指しせず一般論を装って貶める嫌味。「ぞ〜き」係り結びで強調。',
    hints: s14?.hints?.slice(2) || [],
  });
}

// ── 新 s8: 旧 s15 + s16 前半 (二人の婿の装束を縫はす) ──
{
  const s15 = oldAnns.s15;
  const s16 = oldAnns.s16;
  const merged = {
    sentenceId: 's8',
    guide: '北の方が落窪の君に二人の婿の装束を絶え間なく縫わせる。「こそ〜しか」係り結びで「以前は忙しかったが」と回想し、現在の過酷さ（夜も寝ず縫はす）と対比。',
    hints: [...(s15?.hints || []), ...(s16?.hints?.slice(0, 1) || [])],
  };
  newAnnotations.push(merged);
}

// ── 新 s9: 旧 s16 後半 + s17 前半 (もの憂げ・役にせむ) ──
{
  const s16 = oldAnns.s16;
  const s17 = oldAnns.s17;
  const merged = {
    sentenceId: 's9',
    guide: '少しでも遅くなると北の方が「もの憂げにしたまふは何を役にせむとならむ」と詰問する。「だに」（〜さえも）で最低限のことすらと強調、「む」の重なりで意志＋推量を示す反語的詰問。',
    hints: [...(s16?.hints?.slice(1) || []), ...(s17?.hints?.slice(0, 2) || [])],
  };
  newAnnotations.push(merged);
}

// ── 新 s10: 旧 s17 後半 (いかでなほ消え失せぬるわざもがな) ──
{
  const s17 = oldAnns.s17;
  newAnnotations.push({
    sentenceId: 's10',
    guide: '落窪の君の絶望の願望「いかでなほ消え失せぬるわざもがな」（なんとか消えてしまう方法がほしい）。「もがな」は願望の終助詞、「いかで」は強い願望を導く副詞。',
    hints: s17?.hints?.slice(2) || [],
  });
}

// ── 新 s11: 「と嘆く。」短文 ──
newAnnotations.push({
  sentenceId: 's11',
  guide: '直前の願望表現を引用助詞「と」で受けて「嘆く」で締める。終止形で文を閉じつつ、嘆きが繰り返される情景を残す。',
  hints: [
    {
      type: 'structure',
      label: '会話文の締め方',
      points: [
        '「いかでなほ消え失せぬるわざもがな」を「と」で受ける',
        '「嘆く」終止形で一文を閉じる',
        '「て、嘆きて、…と嘆く」と三度の嘆きで絶望の深さを強調',
      ],
    },
  ],
});

// ── 新 s12: 旧 s18 (三の君 裳着 蔵人の少将) ──
newAnnotations.push({ ...oldAnns.s18, sentenceId: 's12' });

// ── 新 s13: 「落窪の君、まして暇なく、苦しきことまさる。」 ──
newAnnotations.push({
  sentenceId: 's13',
  guide: '三の君への厚遇との対比で、落窪の君の苦境がさらに増したことを簡潔に総括する一文。「まして」（ましてや）で程度の強まりを示す。',
  hints: [
    {
      type: 'structure',
      label: '対比の総括',
      points: [
        '前文（s12）の三の君への手厚いいたわりと対比',
        '「まして暇なく、苦しきことまさる」＝姉妹の幸福と落窪の君の不幸を並列',
        '次文（s14）の縫物労働の具体的描写へ導く一文',
      ],
    },
    {
      type: 'vocab',
      label: '「まして」「まさる」',
      points: [
        '「まして」＝程度副詞（ましてや・なおさら）',
        '「まさる」＝増す・上回る（自動詞・四段）',
        '「苦しきことまさる」＝苦しさが増していく',
      ],
    },
  ],
});

// ── 新 s14: 旧 s19 + s20 + s21 統合 (若くめでたき人〜縫ふままに) ──
{
  const s19 = oldAnns.s19;
  const s20 = oldAnns.s20;
  const s21 = oldAnns.s21;
  const merged = {
    sentenceId: 's14',
    guide: '「若くめでたき人」（落窪の君を遠回しに指す）が実用労働をすると侮られやすく、つらいので泣きながら縫う、と語り手が婉曲に同情を寄せる。次文の和歌へ導入する。「や〜けむ」係り結び・「あなづる」「わびし」など重要古語が密集。',
    hints: [...(s19?.hints || []), ...(s20?.hints || []), ...(s21?.hints || [])],
  };
  newAnnotations.push(merged);
}

// ── 新 s15: 旧 s22 (waka 世の中にいかであらじ) ──
newAnnotations.push({ ...oldAnns.s22, sentenceId: 's15' });

// ── 新 s16: 旧 s23 (召しに召し出づ) ──
newAnnotations.push({ ...oldAnns.s23, sentenceId: 's16' });

// ── 新 s17: 旧 s24 前半 (本意なくかなし「わが君に」) ──
{
  const s24 = oldAnns.s24;
  newAnnotations.push({
    sentenceId: 's17',
    guide: '後見が「本意なくかなし」と思い「わが君（＝落窪の君）に仕うまつらむと思ひてこそ、親しき人の迎ふるにもまからざりつれ」と訴える。「こそ〜つれ」係り結びで強い意志を示す。',
    hints: s24?.hints?.slice(0, 2) || [],
  });
}

// ── 新 s18: 旧 s24 後半 (こと君どりはしたてまつらむ) ──
{
  const s24 = oldAnns.s24;
  newAnnotations.push({
    sentenceId: 's18',
    guide: '後見の反語的訴え「何のよしにか、こと君どりはしたてまつらむ」（どんな理由があってよその主人に仕えたりするものか、いやそうはしない）。「か〜む」係り結びで反語。',
    hints: s24?.hints?.slice(2) || [],
  });
}

// ── 新 s19: 旧 s25 冒頭 (「何か」) ──
{
  const s25 = oldAnns.s25;
  newAnnotations.push({
    sentenceId: 's19',
    guide: '後見の発話を引用助詞「と」で締め、「君、『何か。』」で落窪の君の返答が始まる。「何か」は反語（どうしてそうなろうか、いや…）で後見をなだめる。',
    hints: s25?.hints?.slice(0, 1) || [],
  });
}

// ── 新 s20: 旧 s25 中盤 (同じことと見てむ) ──
{
  const s25 = oldAnns.s25;
  newAnnotations.push({
    sentenceId: 's20',
    guide: '落窪の君のなぐさめ「同じ所に住まむ限りは、同じことと見てむ」（同じ家にいる限りは同じだと思おう）。「てむ」は強意の完了「つ」未然＋推量「む」の連語で、強い意志を示す。',
    hints: s25?.hints?.slice(1, 2) || [],
  });
}

// ── 新 s21: 旧 s25 後半 (なかなかうれし) ──
{
  const s25 = oldAnns.s25;
  newAnnotations.push({
    sentenceId: 's21',
    guide: '「衣などの見苦しかりつるに、なかなかうれしとなむ見る」（衣装が見苦しかったので、かえってうれしいと思っている）。「なむ〜見る」の係り結びで強意。逆説の「なかなか」で犠牲的優しさを示す。',
    hints: s25?.hints?.slice(2) || [],
  });
}

// ── 新 s22: 「とのたまふ。」短文 ──
newAnnotations.push({
  sentenceId: 's22',
  guide: '落窪の君の発話を引用助詞「と」で締める。「のたまふ」は「言ふ」の尊敬語で、語り手の落窪の君への敬意を示す。',
  hints: [
    {
      type: 'grammar',
      label: '尊敬語「のたまふ」',
      points: [
        '「のたまふ」＝「言ふ」の尊敬（おっしゃる）',
        '主語が落窪の君であることを敬語で確定',
        '「言ふ」より丁寧な語感で姫君らしさを示す',
      ],
    },
  ],
});

// ── 新 s23: 旧 s26 + s27 (心細げ・あこき改名) ──
{
  const s26 = oldAnns.s26;
  const s27 = oldAnns.s27;
  const merged = {
    sentenceId: 's23',
    guide: '後見視点で落窪の君を見て「心細げ」と感じ、いつもそばに入り浸る → 北の方が叱る → 落窪の君が自然と腹立たしく感じる、という感情の連鎖。「自発の助動詞「れ」」「便なし」など重要文法。',
    hints: [...(s26?.hints || []), ...(s27?.hints?.slice(0, 2) || [])],
  };
  newAnnotations.push(merged);
}

// ── 新 s24: 「後見といふ名いと便なしとて、あこきとつけたまふ。」 ──
{
  const s27 = oldAnns.s27;
  newAnnotations.push({
    sentenceId: 's24',
    guide: '北の方が「後見」という名を「便なし」（具合が悪い・不都合だ）と判断し、「あこき」と改名する。落窪の君と侍女との結び付きを薄める意図。皮肉にもこの「あこき」が後の物語で姫君を救う鍵となる。',
    hints: s27?.hints?.slice(2) || [],
  });
}

// ── 新 s25: 旧 s28 (かかるほどに 小帯刀) ──
newAnnotations.push({ ...oldAnns.s28, sentenceId: 's25' });

// ── 新 s26: 旧 s29 (あこきの語り) ──
newAnnotations.push({ ...oldAnns.s29, sentenceId: 's26' });

// ── 新 s27: 旧 s30 (盗ませたてまつらむ) ──
newAnnotations.push({ ...oldAnns.s30, sentenceId: 's27' });

// ── 新 s28: 旧 s31 (と言ひ思ふ 巻末) ──
{
  const s31 = oldAnns.s31;
  newAnnotations.push({
    sentenceId: 's28',
    guide: '「あたらもの」（もったいないもの）と繰り返し言いもし思いもする日々を「と言ひ思ふ」で締める。「言ひ思ふ」の終止形で巻一の本文を閉じる。',
    hints: s31?.hints || [],
  });
}

// ── 新 s29: 「（巻の一）」 ──
newAnnotations.push({
  sentenceId: 's29',
  guide: '底本の編集上の巻末注記。落窪物語は全四巻で構成され、本テキストは第一巻の冒頭部分。第二巻以降で道頼（蔵人の少将）との出会いと救出劇が展開する。',
  hints: [
    {
      type: 'structure',
      label: '巻末の編集注記',
      points: [
        '「（巻の一）」＝原典の巻末を示す編集注記',
        '本テキストは落窪物語 巻一の冒頭部分のみ',
        '物語全体は (1) 巻一: 境遇紹介 (2) 巻二〜三: 道頼との結び付き・救出 (3) 巻四: 復讐と大団円 と展開',
      ],
    },
  ],
});

r.annotations = newAnnotations;

fs.writeFileSync(fp, JSON.stringify(r, null, 2), 'utf8');
if (fs.existsSync(path.dirname(distFp))) {
  fs.writeFileSync(distFp, JSON.stringify(r, null, 2), 'utf8');
}

console.log('Reading annotations after remap:');
console.log('  IDs:', r.annotations.map(a => a.sentenceId).join(','));
console.log('  count:', r.annotations.length);
