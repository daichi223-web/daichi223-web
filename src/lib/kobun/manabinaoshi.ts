// 学び始め（どこから始めたらいいかわからない生徒の入口。旧名 学び直し。URL /manabinaoshi と記録の mode はそのまま）。
// やる気がなくても、やっているうちに学べることを目指す（下の段は問いが先、説明はあと）。
//
// 日本語教育の組み立てを借りる:
//  - 自分の位置は Can-do（「〜ができる」）の文で選ぶ。用語を知らなくても選べる
//  - 形は「後ろに何がつくか」で先に覚え、文法の名前はあとからつける（ない形・て形の考え方）
//  - 用語はその段で初めて要るところで出す（補助動詞・自動詞他動詞は助動詞がわかった後）
// 判定は各単元のいちばん易しいドリル1問ずつ。SRS は進めない（未習の問題に期日を付けない）。
import type { GrammarDrill } from "@/lib/kobun/types";
import { orderIndex } from "@/lib/kobun/curriculum";

export type StageId = 0 | 1 | 2 | 3 | 4;
export type DojoCategory = "用言" | "助動詞" | "助詞" | "敬語";

export interface TermCheck {
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
}

/** 用語カード（やさしい説明＋例＋確認の1問） */
export interface TermCard {
  id: string;
  term: string;
  plain: string;
  /** 例。表にしたいときは [左, 右] の組 */
  examples: (string | [string, string])[];
  check: TermCheck;
}

export interface Stage {
  id: StageId;
  title: string;
  /** 自分で選ぶときの Can-do（「〜できる」）。用語を使わない */
  canDo: string[];
  /** 文法道場のカテゴリ（0 は道場の単元を持たない） */
  category: DojoCategory | null;
  /** 段の入口の「〜とは」（見出しと説明。段0は持たない） */
  about?: { heading: string; body: string; points: (string | [string, string])[] };
  /** この段で初めて出てくる言葉 */
  terms: TermCard[];
}

const KIHON: TermCard[] = [
  {
    id: "yougen",
    term: "用言",
    plain: "動き・ようす・状態を表し、後ろに続く言葉によって形が変わる言葉。動詞・形容詞・形容動詞の3つ。",
    examples: [["動詞", "書く・見る・あり"], ["形容詞", "美し・高し"], ["形容動詞", "静かなり・あはれなり"]],
    check: {
      prompt: "用言でないものはどれ？",
      choices: ["書く", "美し", "静かなり", "花"],
      answer: "花",
      explanation: "「花」は形が変わらない言葉（体言＝名詞）。ほかの3つは形が変わる用言。",
    },
  },
  {
    id: "taigen",
    term: "体言",
    plain: "名詞のこと。形が変わらない。「が」「を」などをつけて文の中で使う。",
    examples: ["月・花・人・山"],
    check: {
      prompt: "体言はどれ？",
      choices: ["月", "見る", "高し", "静かなり"],
      answer: "月",
      explanation: "「月」は名詞＝体言。ほかの3つは形が変わる用言。",
    },
  },
  {
    id: "katsuyo",
    term: "活用",
    plain: "後ろに続く言葉に合わせて、語の終わりの形が変わること。",
    examples: ["書か（ず）／書き（けり）／書く。／書く（とき）／書け（ども）／書け。"],
    check: {
      prompt: "活用しない言葉はどれ？",
      choices: ["見る", "高し", "山", "あはれなり"],
      answer: "山",
      explanation: "「山」は名詞なので形が変わらない。動詞・形容詞・形容動詞は活用する。",
    },
  },
  {
    id: "gokan",
    term: "語幹と活用語尾",
    plain: "活用しても変わらない部分が語幹、変わる部分が活用語尾。",
    examples: [["語幹", "書"], ["活用語尾", "か・き・く・け"]],
    check: {
      prompt: "「書けども」の「書け」で、活用語尾はどれ？",
      choices: ["書", "け", "書け"],
      answer: "け",
      explanation: "変わらない「書」が語幹、変わる「け」が活用語尾。「ども」は後ろについた助詞。",
    },
  },
  {
    id: "katsuyokei",
    term: "活用形（6つの形）",
    plain: "まず「後ろに何がつくか」で覚えよう。名前はあとからついてくる。",
    examples: [
      ["「ず」「む」がつく形", "未然形（書か）"],
      ["「けり」「て」がつく形", "連用形（書き）"],
      ["「。」で言い切る形", "終止形（書く）"],
      ["「とき」「こと」（体言）がつく形", "連体形（書く）"],
      ["「ども」「ば」がつく形", "已然形（書け）"],
      ["命令して言い切る形", "命令形（書け）"],
    ],
    check: {
      prompt: "「書くとき」の「書く」は何形？",
      choices: ["未然形", "連用形", "終止形", "連体形"],
      answer: "連体形",
      explanation: "後ろに体言「とき」がついているので連体形。同じ「書く」でも「。」で言い切れば終止形。",
    },
  },
  {
    id: "jodoshi",
    term: "助動詞",
    plain: "用言などの後ろについて、意味をそえる小さな言葉。助動詞も活用する。",
    examples: [["書か＋ず", "書かない（打消）"], ["書き＋けり", "書いた（過去）"], ["書か＋む", "書くだろう・書こう（推量・意志）"]],
    check: {
      prompt: "「書きけり」で、助動詞はどれ？",
      choices: ["書", "き", "けり"],
      answer: "けり",
      explanation: "「書き」は動詞（連用形）。後ろについて「〜た」の意味をそえる「けり」が助動詞。",
    },
  },
  {
    id: "joshi",
    term: "助詞",
    plain: "後ろについて、言葉どうしの関係を示したり意味をそえたりする小さな言葉。助詞は活用しない。",
    examples: ["花の色（の）／春は（は）／行けども（ども）"],
    check: {
      prompt: "助動詞と助詞のちがいは？",
      choices: ["助動詞は活用する、助詞は活用しない", "助詞は活用する、助動詞は活用しない", "どちらも活用しない"],
      answer: "助動詞は活用する、助詞は活用しない",
      explanation: "どちらも後ろにつく小さな言葉だが、形が変わるのは助動詞だけ。",
    },
  },
  {
    id: "setsuzoku",
    term: "接続",
    plain: "助動詞や助詞が、前の語に「この形で来て」と決めているきまり。",
    examples: [["「ず」は未然形に接続", "書か＋ず"], ["「けり」は連用形に接続", "書き＋けり"]],
    check: {
      prompt: "「ず」の前に来るのは何形？",
      choices: ["未然形", "連用形", "終止形", "連体形"],
      answer: "未然形",
      explanation: "「ず」は未然形に接続する。だから「書く」は「書か」になって「書かず」。",
    },
  },
];

const YOUGEN_TERMS: TermCard[] = [
  {
    id: "gyo-dan",
    term: "行と段",
    plain: "五十音図の縦の並びが「行」、横の並びが「段」。「カ行四段活用」は、カ行の音のまま、ア・イ・ウ・エの4つの段に形が変わる活用。",
    examples: [["カ行", "か・き・く・け・こ"], ["ア段", "あ・か・さ・た・な…"]],
    check: {
      prompt: "「書か（ず）」の「か」は何段？",
      choices: ["ア段", "イ段", "ウ段", "エ段"],
      answer: "ア段",
      explanation: "「か」は母音が a なのでア段。「ず」をつけてア段になる動詞は四段活用。",
    },
  },
  {
    id: "onbin",
    term: "音便",
    plain: "言いやすいように音が変わること。主に連用形に「て」「たり」が続くときに起こる。",
    examples: [["イ音便", "書きて → 書いて"], ["ウ音便", "美しくて → 美しうて"], ["撥音便", "飛びて → 飛んで"], ["促音便", "立ちて → 立つて"]],
    check: {
      prompt: "「書いて」は何音便？",
      choices: ["イ音便", "ウ音便", "撥音便", "促音便"],
      answer: "イ音便",
      explanation: "「書きて」の「き」が「い」に変わったのでイ音便。",
    },
  },
];

const JODOSHI_TERMS: TermCard[] = [
  {
    id: "imi",
    term: "助動詞の「意味」",
    plain: "助動詞が文にそえるはたらきの呼び名（過去・完了・推量・打消など）。同じ助動詞でも、文によって意味が変わることがある。",
    examples: [["雨降らむ", "雨が降るだろう（推量）"], ["我行かむ", "私は行こう（意志）"]],
    check: {
      prompt: "「我行かむ」の「む」の意味は？",
      choices: ["推量", "意志", "過去", "打消"],
      answer: "意志",
      explanation: "主語が「我」（自分）なので「行こう」という意志。主語が自分以外なら推量になりやすい。",
    },
  },
];

const JOSHI_TERMS: TermCard[] = [
  {
    id: "joshi-shurui",
    term: "格助詞・接続助詞・係助詞",
    plain: "助詞は役割で分ける。格助詞＝主に体言について関係を示す。接続助詞＝前と後ろをつなぐ。係助詞＝強めたり疑問を示したりして、文の終わりの形を変える。",
    examples: [["格助詞", "の・が・を・に"], ["接続助詞", "ば・ども・て"], ["係助詞", "ぞ・なむ・や・か・こそ"]],
    check: {
      prompt: "「行けども」の「ども」はどれ？",
      choices: ["格助詞", "接続助詞", "係助詞"],
      answer: "接続助詞",
      explanation: "「行けども（行くけれども）」と前と後ろをつないでいるので接続助詞。",
    },
  },
  {
    id: "jun-gyaku",
    term: "順接・逆接",
    plain: "順接＝前から当然そうなる流れ（〜ので）。逆接＝予想と反対になる流れ（〜けれども）。",
    examples: [["雨降れば行かず", "雨が降るので行かない（順接）"], ["雨降れども行く", "雨が降るけれども行く（逆接）"]],
    check: {
      prompt: "「雨降れども行く」のつながりは？",
      choices: ["順接", "逆接"],
      answer: "逆接",
      explanation: "雨が降るのに行く＝予想と反対なので逆接。「ども」は逆接の接続助詞。",
    },
  },
  {
    id: "katei-kakutei",
    term: "仮定・確定",
    plain: "仮定＝まだ起きていないこと（もし〜ならば）。確定＝もう起きていること（〜ので・〜すると）。「ば」は前の形で決まる。",
    examples: [["未然形＋ば", "雨降らば＝もし雨が降るならば（仮定）"], ["已然形＋ば", "雨降れば＝雨が降るので（確定）"]],
    check: {
      prompt: "「雨降らば」はどちら？",
      choices: ["仮定", "確定"],
      answer: "仮定",
      explanation: "「降ら」は未然形。未然形＋ば は「もし〜ならば」の仮定。",
    },
  },
  {
    id: "kakari-musubi",
    term: "係り結び",
    plain: "文の中に係助詞「ぞ・なむ・や・か」があると文の終わりが連体形に、「こそ」があると已然形になる。",
    examples: [["山ぞ高き", "「ぞ」→ 連体形「高き」"], ["山こそ高けれ", "「こそ」→ 已然形「高けれ」"]],
    check: {
      prompt: "「こそ」があるとき、文の終わりは何形？",
      choices: ["終止形", "連体形", "已然形"],
      answer: "已然形",
      explanation: "「ぞ・なむ・や・か」は連体形、「こそ」だけは已然形で結ぶ。",
    },
  },
];

/** 敬語の段の入口＝助動詞がわかった後で出す言葉（本動詞・補助動詞、自動詞・他動詞もここ） */
const KEIGO_TERMS: TermCard[] = [
  {
    id: "shugo",
    term: "主語と敬語",
    plain: "古文では「誰が」が書かれないことが多い。敬語は、誰の動作か・誰を高めているかを知る手がかりになる。",
    examples: ["（帝が）おはします → 敬語から、身分の高い人の動作とわかる"],
    check: {
      prompt: "主語が書かれていないとき、誰の動作かを知る手がかりになるのは？",
      choices: ["敬語", "句読点", "漢字の数"],
      answer: "敬語",
      explanation: "尊敬語がついていれば、高められる人の動作だと見当がつく。",
    },
  },
  {
    id: "keigo-3",
    term: "尊敬・謙譲・丁寧",
    plain: "尊敬語＝動作をする人を高める。謙譲語＝動作を受ける人を高める。丁寧語＝聞き手（読み手）に丁寧に言う。",
    examples: [["尊敬語", "おはす・のたまふ・給ふ"], ["謙譲語", "申す・奉る・参る"], ["丁寧語", "侍り・候ふ"]],
    check: {
      prompt: "「おはす」はどれ？",
      choices: ["尊敬語", "謙譲語", "丁寧語"],
      answer: "尊敬語",
      explanation: "「おはす」は「いらっしゃる」。動作をする人を高める尊敬語。",
    },
  },
  {
    id: "hojo-doushi",
    term: "本動詞・補助動詞",
    plain: "本動詞＝その語本来の意味で使う。補助動詞＝ほかの動詞の後ろについて、敬意などをそえるだけになる。",
    examples: [["給ふ（本動詞）", "お与えになる"], ["書き給ふ（補助動詞）", "お書きになる"]],
    check: {
      prompt: "「書き給ふ」の「給ふ」はどちら？",
      choices: ["本動詞", "補助動詞"],
      answer: "補助動詞",
      explanation: "動詞「書き」の後ろについて「お〜になる」の敬意だけをそえているので補助動詞。",
    },
  },
  {
    id: "jita",
    term: "自動詞・他動詞",
    plain: "他動詞＝「〜を」をとって何かに働きかける。自動詞＝「〜を」をとらない。古文では、同じ字でも活用の種類で分かれる語がある。",
    examples: [["戸開く（四段）", "戸が開く（自動詞）"], ["戸を開く（下二段）", "戸を開ける（他動詞）"]],
    check: {
      prompt: "「戸を開く」の「開く」はどちら？",
      choices: ["自動詞", "他動詞"],
      answer: "他動詞",
      explanation: "「戸を」と「〜を」をとって働きかけているので他動詞。",
    },
  },
];

export const STAGES: Stage[] = [
  {
    id: 0,
    title: "ことばのきほん",
    canDo: ["動詞・名詞がどれか見分けられる", "「書かず」「書きけり」のように、後ろの言葉で形が変わるとわかる"],
    category: null,
    terms: KIHON,
  },
  {
    id: 1,
    title: "形の変わり方（用言）",
    canDo: ["「書く」に「ず」をつけて「書かず」と言える", "「起く」「受く」にも「ず」をつけた形が作れる"],
    category: "用言",
    about: {
      heading: "用言とは",
      body: "それだけで文の述語（「どうする」「どんなだ」）になれて、後ろに続く言葉によって形が変わる（活用する）言葉。動詞・形容詞・形容動詞の3つ。言い切りの形（終止形）の終わり方で見分ける。",
      points: [
        ["動詞", "ウ段で終わる（書く・見る・来）。ラ変だけは「り」（あり・をり）"],
        ["形容詞", "「し」で終わる（高し・美し）"],
        ["形容動詞", "「なり」「たり」で終わる（静かなり・堂々たり）"],
      ],
    },
    terms: YOUGEN_TERMS,
  },
  {
    id: 2,
    title: "意味をそえる小さな言葉（助動詞）",
    canDo: ["「けり」「む」「ず」が文にどんな意味をそえるか言える", "「む」の前の形を正しく作れる"],
    category: "助動詞",
    about: {
      heading: "助動詞とは",
      body: "用言などの後ろについて、打消・過去・推量などの意味をそえる言葉。自分だけでは使えず、助動詞も活用する。1つの助動詞ごとに、次の3つをおさえる。",
      points: [
        ["接続", "前の語を何形にするか（「ず」は未然形）"],
        ["意味", "どんな意味をそえるか（「けり」は過去・詠嘆）"],
        ["活用", "助動詞自身の形の変わり方"],
      ],
    },
    terms: JODOSHI_TERMS,
  },
  {
    id: 3,
    title: "つなぐ言葉・強める言葉（助詞）",
    canDo: ["「降らば」と「降れば」の意味のちがいが言える", "「ぞ」「こそ」があると文の終わりの形が変わるとわかる"],
    category: "助詞",
    about: {
      heading: "助詞とは",
      body: "後ろについて、言葉どうしの関係を示したり意味をそえたりする言葉。活用しない。古文の読解で特に大事なのは、文と文のつなぎ方と、文の終わりの形を変える係り結び。",
      points: [
        ["格助詞", "の・が・を・に（言葉どうしの関係）"],
        ["接続助詞", "ば・ども・て（前と後ろのつなぎ方）"],
        ["係助詞", "ぞ・なむ・や・か・こそ（係り結び）"],
      ],
    },
    terms: JOSHI_TERMS,
  },
  {
    id: 4,
    title: "誰が誰を高めているか（敬語）",
    canDo: ["「給ふ」があると、誰を高めているか言える", "主語が書かれていなくても、敬語から誰の動作か見当がつく"],
    category: "敬語",
    about: {
      heading: "敬語とは",
      body: "話し手（書き手）が、登場人物や聞き手（読み手）を高めて敬意を表す言い方。誰から誰への敬意かを考えると、書かれていない主語が見えてくる。",
      points: [
        ["尊敬語", "動作をする人を高める（おはす・給ふ）"],
        ["謙譲語", "動作を受ける人を高める（申す・奉る）"],
        ["丁寧語", "聞き手（読み手）を高める（侍り・候ふ）"],
      ],
    },
    terms: KEIGO_TERMS,
  },
];

/**
 * 段ごとの見せ方（学習レベルで簡易さと複雑さを変える）。
 * 下の段ほど一度に見せる量を減らし、間違えたら同じ問いに答え直して正解で終える。
 * 上の段は一覧で見渡せて、知っている言葉は飛ばせる（初学者には手順を、
 * 進んだ学習者には手引きを減らす＝専門知識逆転効果）。
 */
export interface StageStyle {
  /** step = 1画面1枚 / list = 全部を1ページに */
  layout: "step" | "list";
  /** まず問いに答え、説明は答えたあと（とヒント）で出す。読む気がなくても、やるうちに説明が入る */
  questionFirst: boolean;
  /** 選択肢の上限（正解は必ず残す） */
  maxChoices: number;
  /** 間違えたら同じ問いに答え直す（正誤の記録は最初の1回） */
  retry: boolean;
  /** 判定はこの数だけ × がついたら止める（0 = 止めない） */
  stopAfterMisses: number;
}

export function stageStyle(id: StageId): StageStyle {
  if (id === 0) return { layout: "step", questionFirst: true, maxChoices: 3, retry: true, stopAfterMisses: 0 };
  if (id <= 2) return { layout: "step", questionFirst: true, maxChoices: 4, retry: true, stopAfterMisses: 2 };
  return { layout: "list", questionFirst: false, maxChoices: 99, retry: false, stopAfterMisses: 2 };
}

/** 選択肢を max 個までに減らす。正解は必ず残し、残りは元の並びの先頭から */
export function limitChoices(choices: string[], answer: string | string[], max: number): string[] {
  if (choices.length <= max) return choices;
  const ans = Array.isArray(answer) ? answer : [answer];
  const right = choices.filter((c) => ans.includes(c)).slice(0, 1);
  const wrong = choices.filter((c) => !ans.includes(c)).slice(0, Math.max(0, max - right.length));
  return choices.filter((c) => right.includes(c) || wrong.includes(c));
}

/** 判定を止めるか（× の数が上限に達した） */
export function shouldStop(items: PlacementItem[], stopAfterMisses: number): boolean {
  return stopAfterMisses > 0 && items.filter((i) => !i.correct).length >= stopAfterMisses;
}

/** 判定に使えるドリル＝2択以上で、正解が選択肢に入っているもの */
function usable(d: GrammarDrill): boolean {
  if (!d.choices || d.choices.length < 2) return false;
  const a = Array.isArray(d.answer) ? d.answer : [d.answer];
  return a.some((x) => d.choices!.includes(x));
}

/** 各単元のいちばん易しい1問（sort 最小）を、単元の教える順に並べる */
export function pickPlacementDrills(drills: GrammarDrill[], topicIds: string[]): GrammarDrill[] {
  const best = new Map<string, GrammarDrill>();
  for (const d of drills) {
    if (!topicIds.includes(d.topicId) || !usable(d)) continue;
    const cur = best.get(d.topicId);
    if (!cur || (d.sort ?? 0) < (cur.sort ?? 0)) best.set(d.topicId, d);
  }
  return [...best.values()].sort((a, b) => orderIndex(a.topicId) - orderIndex(b.topicId));
}

export function isCorrect(answer: string | string[], choice: string): boolean {
  return Array.isArray(answer) ? answer.includes(choice) : answer === choice;
}

export interface PlacementItem {
  /** 単元 id（0 の段は用語カードの id） */
  id: string;
  correct: boolean;
}

export interface Placement {
  correct: number;
  total: number;
  /** 最初に × がついたもの。全部 ○ なら null */
  startAt: string | null;
  /** 正答が半分に満たない（1つ前の段も確かめたほうがよい） */
  shaky: boolean;
}

export function judgePlacement(items: PlacementItem[]): Placement {
  const correct = items.filter((i) => i.correct).length;
  const total = items.length;
  const miss = items.find((i) => !i.correct);
  return { correct, total, startAt: miss ? miss.id : null, shaky: total > 0 && correct * 2 < total };
}
